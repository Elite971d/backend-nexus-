// controllers/crmController.js
const Lead = require('../models/Lead');
const Buyer = require('../models/Buyer');
const multer = require('multer');
const { parseCsvBuffer } = require('../utils/csvParser');
const { sendNewDealAlert } = require('../utils/sms');
const { upsertLeadFromSource } = require('../utils/leadUpsert');
const { scoreLead, recalculateAndSaveLeadScore } = require('../utils/leadScoringEngine');
const { matchBuyerToLead } = require('../utils/buyerMatcher');
const { emitToTenant, emitToRole, emitToRoom } = require('../utils/realtime');

const upload = multer(); // memory storage

// GET /api/leads
exports.getLeads = async (req, res, next) => {
  try {
    const { status, category, q } = req.query;
    const filter = { tenantId: req.user.tenantId }; // Tenant-scoped
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (q) {
      filter.$or = [
        { ownerName: new RegExp(q, 'i') },
        { propertyAddress: new RegExp(q, 'i') }
      ];
    }

    const leads = await Lead.find(filter).sort({ updatedAt: -1 }).limit(500);
    res.json(leads || []);
  } catch (err) {
    // Never crash - return empty array on error
    console.error('Error fetching CRM leads:', err);
    res.json([]);
  }
};

// POST /api/leads  (manual create)
exports.createLead = async (req, res, next) => {
  try {
    // Add tenantId from user context
    const payload = { ...req.body, tenantId: req.user.tenantId };
    const { lead, isNew } = await upsertLeadFromSource('manual', payload);
    // Send SMS alert if this is a new lead
    await sendNewDealAlert(lead, isNew);
    
    // Emit real-time event
    if (lead.tenantId) {
      emitToTenant(lead.tenantId, 'lead:created', { leadId: lead._id, lead });
      emitToRoom(`lead:${lead._id}`, 'lead:created', { leadId: lead._id, lead });
    }
    
    res.json(lead);
  } catch (err) {
    next(err);
  }
};

// POST /api/leads/:id/status
exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { status },
      { new: true }
    );
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    
    // Emit real-time event
    if (lead.tenantId) {
      emitToTenant(lead.tenantId, 'lead:updated', { leadId: lead._id, lead, changes: { status } });
      emitToRoom(`lead:${lead._id}`, 'lead:updated', { leadId: lead._id, lead });
    }
    
    res.json(lead);
  } catch (err) {
    next(err);
  }
};

// POST /api/leads/upload-csv
// Accepts a CSV file (field name: file)
exports.uploadCsvMiddleware = upload.single('file');

exports.uploadCsv = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file required' });

    const records = await parseCsvBuffer(req.file.buffer);

    // Expect headers like ownerName, propertyAddress, category, status, tags, askingPrice, city, state, zip
    const toInsert = records.map(r => {
      const tags = r.tags
        ? String(r.tags)
            .split(/[;,]/)
            .map(t => t.trim())
            .filter(Boolean)
        : [];

      return {
        source: r.source || 'csv_upload',
        category: r.category || '',
        ownerName: r.ownerName || '',
        propertyAddress: r.propertyAddress || '',
        mailingAddress: r.mailingAddress || '',
        city: r.city || '',
        state: r.state || '',
        zip: r.zip || '',
        askingPrice: r.askingPrice ? Number(r.askingPrice) : undefined,
        beds: r.beds ? Number(r.beds) : undefined,
        baths: r.baths ? Number(r.baths) : undefined,
        sqft: r.sqft ? Number(r.sqft) : undefined,
        status: r.status || 'new',
        tags,
        notes: r.notes || '',
        createdFrom: 'csv_upload'
      };
    });

    // Use upsertLeadFromSource for each record to handle deduplication
    const tenantId = req.user.tenantId;
    const results = await Promise.all(
      toInsert.map(payload => upsertLeadFromSource('csv_upload', { ...payload, tenantId }))
    );
    
    // Send SMS alerts for new leads only
    for (const { lead, isNew } of results) {
      await sendNewDealAlert(lead, isNew);
    }

    const newCount = results.filter(r => r.isNew).length;
    res.json({ inserted: results.length, new: newCount, updated: results.length - newCount });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leads/:id/score
 * Get lead score (calculated on-the-fly)
 */
exports.getLeadScore = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const scoringResult = await scoreLead(lead);
    res.json(scoringResult);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/leads/:id/recalculate-score
 * Recalculate and save lead score
 */
exports.recalculateScore = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    await recalculateAndSaveLeadScore(lead);
    
    // Return updated lead with score
    const updatedLead = await Lead.findById(req.params.id);
    res.json({
      message: 'Score recalculated',
      lead: updatedLead,
      leadScore: updatedLead.leadScore
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leads/:id/matching-buyers
 * Get matching buyers for a lead
 * Returns list of buyers sorted by matchScore desc
 */
exports.getMatchingBuyers = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { threshold = 70 } = req.query; // Minimum match score threshold

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get all active buyers
    const buyers = await Buyer.find({ active: true });

    // Match each buyer to the lead
    const matchedBuyers = buyers
      .map(buyer => {
        const matchResult = matchBuyerToLead(lead, buyer, parseFloat(threshold));
        return {
          buyer: {
            id: buyer._id,
            name: buyer.name,
            email: buyer.email || (buyer.emails && buyer.emails.length > 0 ? buyer.emails[0] : null),
            phone: buyer.phone || (buyer.phones && buyer.phones.length > 0 ? buyer.phones[0] : null),
            buyerType: buyer.buyerType,
            counties: buyer.counties,
            states: buyer.states,
            propertyTypes: buyer.propertyTypes,
            cashReady: buyer.cashReady,
            proofOfFunds: buyer.proofOfFunds,
            avgCloseDays: buyer.avgCloseDays
          },
          matchScore: matchResult.matchScore,
          matchReasons: matchResult.matchReasons,
          isMatch: matchResult.isMatch,
          failedChecks: matchResult.failedChecks
        };
      })
      .filter(result => result.isMatch) // Only return matches
      .sort((a, b) => b.matchScore - a.matchScore); // Sort by score descending

    res.json({
      lead: {
        id: lead._id,
        propertyAddress: lead.propertyAddress || lead.dialerIntake?.propertyAddress,
        county: lead.county || lead.dialerIntake?.county,
        state: lead.state || lead.dialerIntake?.state,
        askingPrice: lead.askingPrice || lead.listPrice || lead.dialerIntake?.askingPrice
      },
      matchingBuyers: matchedBuyers,
      totalMatches: matchedBuyers.length,
      threshold: parseFloat(threshold)
    });
  } catch (err) {
    next(err);
  }
};
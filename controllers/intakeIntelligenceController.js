/**
 * POST /api/intake/address-check
 * POST /api/intake/score-address
 * GET  /api/intake/geocode-suggest — proxy Nominatim (User-Agent policy)
 */
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const { normalizeAddress } = require('../utils/normalizeAddress');
const { scoreLead } = require('../utils/leadScoringEngine');

function parseStateFromAddressString(addr) {
  const m = String(addr || '').match(/\b([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/i);
  if (m) return m[1].toUpperCase();
  return null;
}

function buildSyntheticLead(tenantId, { address, propertyType, occupancyType }) {
  const norm = normalizeAddress(address || '');
  let state = norm.state || parseStateFromAddressString(address);
  if (!state) state = 'TX';

  return {
    tenantId,
    state,
    city: norm.city || '',
    zip: norm.zip || '',
    county: undefined,
    propertyAddress: address,
    source: 'manual',
    dialerIntake: {
      propertyAddress: address,
      propertyType: propertyType || undefined,
      occupancyType: occupancyType || undefined
    }
  };
}

function tierFromScore(score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  if (s >= 80) return 'hot';
  if (s >= 50) return 'warm';
  return 'cold';
}

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';

exports.geocodeSuggest = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3 || q.length > 200) {
      return res.json([]);
    }
    const url = `${NOMINATIM_SEARCH}?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=8&countrycodes=us`;
    const ua =
      process.env.NOMINATIM_USER_AGENT ||
      'EliteNexus-CRM/1.0 (address-intake; contact via app operator)';
    const r = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': ua
      }
    });
    if (!r.ok) {
      return res.json([]);
    }
    const data = await r.json();
    return res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    console.warn('Nominatim proxy error:', err.message);
    return res.json([]);
  }
};

exports.addressCheck = async (req, res) => {
  try {
    const { address, normalizedAddress, lat, lng, excludeLeadId } = req.body || {};
    const tenantId = req.user.tenantId;

    const parsed = normalizeAddress(normalizedAddress || address || '');
    const targetNorm = parsed.normalizedAddress;
    if (!targetNorm || targetNorm.length < 4) {
      return res.json({ exists: false, confidence: 0 });
    }

    const exclude =
      excludeLeadId && mongoose.Types.ObjectId.isValid(excludeLeadId)
        ? new mongoose.Types.ObjectId(excludeLeadId)
        : null;

    const filter = { tenantId };
    if (exclude) filter._id = { $ne: exclude };

    let candidates;
    if (parsed.zip) {
      const withZip = { ...filter, zip: parsed.zip };
      candidates = await Lead.find(withZip)
        .limit(400)
        .select('ownerName propertyAddress dialerIntake status updatedAt createdAt zip')
        .lean();
      if (candidates.length === 0) {
        candidates = await Lead.find(filter)
          .sort({ updatedAt: -1 })
          .limit(400)
          .select('ownerName propertyAddress dialerIntake status updatedAt createdAt zip')
          .lean();
      }
    } else {
      candidates = await Lead.find(filter)
        .sort({ updatedAt: -1 })
        .limit(400)
        .select('ownerName propertyAddress dialerIntake status updatedAt createdAt zip')
        .lean();
    }

    let best = null;
    for (const L of candidates) {
      const raw = L.propertyAddress || (L.dialerIntake && L.dialerIntake.propertyAddress) || '';
      const n = normalizeAddress(raw).normalizedAddress;
      if (n && n === targetNorm) {
        best = L;
        break;
      }
    }

    let confidence = best ? 0.92 : 0;
    if (best && lat != null && lng != null && !Number.isNaN(+lat) && !Number.isNaN(+lng)) {
      // Optional geo hint: if stored coords exist on lead metadata (future), boost confidence
      confidence = 0.96;
    }

    if (!best) {
      return res.json({ exists: false, confidence: 0 });
    }

    const lastUpdated = best.updatedAt || best.createdAt;

    return res.json({
      exists: true,
      confidence,
      existingLead: {
        id: String(best._id),
        ownerName: best.ownerName || '',
        status: best.status || '',
        lastUpdated: lastUpdated ? new Date(lastUpdated).toISOString() : null
      }
    });
  } catch (err) {
    console.warn('addressCheck error:', err.message);
    return res.json({ exists: false, confidence: 0 });
  }
};

exports.scoreAddress = async (req, res) => {
  try {
    const { address, propertyType, occupancyType } = req.body || {};
    const tenantId = req.user.tenantId;

    if (!address || String(address).trim().length < 3) {
      return res.json({
        score: 0,
        tier: 'cold',
        riskFlags: ['Address too short to score']
      });
    }

    const synthetic = buildSyntheticLead(tenantId, { address, propertyType, occupancyType });
    let result;
    try {
      result = await scoreLead(synthetic);
    } catch (scoreErr) {
      console.warn('scoreLead error:', scoreErr.message);
      return res.json({
        score: 0,
        tier: 'cold',
        riskFlags: []
      });
    }

    const score = Math.max(0, Math.min(100, Number(result.score) || 0));
    const tier = tierFromScore(score);
    const riskFlags = Array.isArray(result.failedChecks) ? result.failedChecks.slice(0, 12) : [];

    return res.json({
      score,
      tier,
      riskFlags
    });
  } catch (err) {
    console.warn('scoreAddress error:', err.message);
    return res.json({
      score: 0,
      tier: 'cold',
      riskFlags: []
    });
  }
};

const Property = require('../models/Property');
const { normalizeAddress } = require('../utils/normalizeAddress');
const { findExistingProperty } = require('../utils/dedupeProperty');
const { enrichCoordinates } = require('../utils/enrichCoordinates');

const LEAD_TYPES = new Set(['cold', 'warm', 'hot']);
const HOT_TAG_SET = new Set(['pre-foreclosure', 'tax lien']);

function normalizeTagList(tags) {
  if (tags == null) return [];
  const arr = Array.isArray(tags) ? tags : [tags];
  return arr.map((t) => String(t).trim()).filter(Boolean);
}

function hasHotTrigger(leadType, tags) {
  if (leadType === 'hot') return true;
  for (const t of tags) {
    const lower = String(t).trim().toLowerCase();
    if (HOT_TAG_SET.has(lower)) return true;
  }
  return false;
}

/**
 * Pipeline routing: hot > dialer (contacted) > scraper (new).
 * @returns {'new'|'contacted'|'hot'|null} null = leave existing status unchanged on merge
 */
function computeRoutedStatus({ leadType, tags, intakeSource }) {
  if (hasHotTrigger(leadType, tags)) return 'hot';
  if (intakeSource === 'dialer') return 'contacted';
  if (intakeSource === 'scraper') return 'new';
  return null;
}

function mergeLocationDoc(existingLoc, patch) {
  const prev =
    existingLoc && typeof existingLoc === 'object'
      ? { ...(existingLoc.toObject?.() || existingLoc) }
      : {};
  return { ...prev, ...patch };
}

/**
 * Apply intake fields to an existing Property document and save.
 */
async function applyIntakeToExisting(existing, ctx) {
  const {
    rawAddress,
    intakeSource,
    incomingTags,
    leadType,
    body,
    locationPatch,
  } = ctx;

  if (typeof body.ownerName === 'string' && body.ownerName.trim()) {
    existing.ownerName = body.ownerName.trim();
  }

  if (!existing.source.includes(intakeSource)) {
    existing.source.push(intakeSource);
  }

  const mergedTags = [...new Set([...normalizeTagList(existing.tags), ...incomingTags])];
  existing.tags = mergedTags;

  if (typeof body.leadType === 'string' && LEAD_TYPES.has(body.leadType)) {
    existing.leadType = leadType;
  }

  existing.propertyAddress = rawAddress;
  existing.location = mergeLocationDoc(existing.location, locationPatch);

  const routed = computeRoutedStatus({
    leadType: existing.leadType,
    tags: mergedTags,
    intakeSource,
  });
  if (routed != null) existing.status = routed;

  await existing.save();
  return existing;
}

/**
 * POST /api/properties/intake — single entry point for property addresses.
 */
async function propertyIntake(req, res) {
  try {
    const body = req.body || {};
    const rawAddress = typeof body.propertyAddress === 'string' ? body.propertyAddress.trim() : '';
    if (!rawAddress) {
      return res.status(400).json({ success: false, error: 'propertyAddress is required' });
    }

    const intakeSource =
      typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'manual';

    const leadType =
      typeof body.leadType === 'string' && LEAD_TYPES.has(body.leadType) ? body.leadType : 'cold';

    const incomingTags = normalizeTagList(body.tags);

    const norm = normalizeAddress(rawAddress);
    if (!norm.normalizedAddress) {
      return res.status(400).json({ success: false, error: 'propertyAddress could not be normalized' });
    }

    const geo = await enrichCoordinates(norm.normalizedAddress);
    const locationPatch = {
      city: norm.city,
      state: norm.state,
      zip: norm.zip,
      lat: geo.lat != null ? geo.lat : null,
      lng: geo.lng != null ? geo.lng : null,
    };

    const ctx = {
      rawAddress,
      intakeSource,
      incomingTags,
      leadType,
      body,
      locationPatch,
    };

    let existing = await findExistingProperty(norm.normalizedAddress);
    if (existing) {
      const doc = await applyIntakeToExisting(existing, ctx);
      return res.status(200).json({ success: true, property: doc, isNew: false });
    }

    const routed = computeRoutedStatus({
      leadType,
      tags: incomingTags,
      intakeSource,
    });
    const status = routed != null ? routed : 'new';

    try {
      const created = await Property.create({
        propertyAddress: rawAddress,
        normalizedAddress: norm.normalizedAddress,
        ownerName: typeof body.ownerName === 'string' ? body.ownerName.trim() : '',
        source: [intakeSource],
        tags: incomingTags,
        status,
        leadType,
        location: locationPatch,
      });

      return res.status(201).json({ success: true, property: created, isNew: true });
    } catch (err) {
      if (err && err.code === 11000) {
        existing = await findExistingProperty(norm.normalizedAddress);
        if (existing) {
          const doc = await applyIntakeToExisting(existing, ctx);
          return res.status(200).json({ success: true, property: doc, isNew: false });
        }
      }
      throw err;
    }
  } catch (err) {
    console.error('propertyIntake error:', err);
    return res.status(500).json({ success: false, error: 'Property intake failed' });
  }
}

module.exports = {
  propertyIntake,
  computeRoutedStatus,
};

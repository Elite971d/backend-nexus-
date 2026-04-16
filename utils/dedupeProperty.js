const Property = require('../models/Property');

/**
 * Find an existing property by normalized address key.
 * @param {string} normalizedAddress
 * @returns {Promise<import('mongoose').Document | null>}
 */
async function findExistingProperty(normalizedAddress) {
  if (!normalizedAddress || typeof normalizedAddress !== 'string') {
    return null;
  }
  return Property.findOne({ normalizedAddress });
}

module.exports = { findExistingProperty };

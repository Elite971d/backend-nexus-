// utils/skiptrace/publicRecordsProvider.js
/**
 * Public Records Provider
 * Extracts contact data from existing lead fields and public records data
 * 
 * Sources:
 * - County appraisal district data (mailingAddress)
 * - Tax assessor records
 * - Clerk/probate filings
 * - Secretary of State (for LLCs/businesses)
 * 
 * This provider uses data ALREADY in the lead, not scraping external sites
 */
const BaseProvider = require('./baseProvider');

class PublicRecordsProvider extends BaseProvider {
  /**
   * Extracts contact info from lead's existing public records data
   */
  async skipTrace(lead) {
    const result = {
      phones: [],
      emails: [],
      mailingAddress: null,
      ownerType: null,
      source: 'public_records',
      confidenceScore: 0
    };

    try {
      // Extract mailing address if available
      if (lead.mailingAddress) {
        result.mailingAddress = this.normalizeAddress(lead.mailingAddress);
        result.confidenceScore += 30; // Mailing address is reliable
      }

      // Determine owner type
      if (lead.ownerName) {
        const ownerName = lead.ownerName.toLowerCase();
        // Check for business indicators
        if (
          ownerName.includes('llc') ||
          ownerName.includes('inc') ||
          ownerName.includes('corp') ||
          ownerName.includes('ltd') ||
          ownerName.includes('lp') ||
          ownerName.includes('llp') ||
          ownerName.includes('trust')
        ) {
          result.ownerType = 'entity';
          result.entityName = lead.ownerName;
        } else {
          result.ownerType = 'individual';
        }
      }

      // If we have mailing address, add it to mailingAddresses array format
      // (for compatibility with Lead.skipTrace.mailingAddresses schema)
      if (result.mailingAddress) {
        result.mailingAddresses = [{
          address: result.mailingAddress,
          confidence: 80,
          lastSeen: new Date()
        }];
      }

      // Calculate confidence score
      if (result.mailingAddress) {
        result.confidenceScore = Math.min(100, result.confidenceScore);
      }

      return result;
    } catch (error) {
      console.error('[PublicRecordsProvider] Error extracting public records:', error);
      // Return empty result on error (non-blocking)
      return {
        phones: [],
        emails: [],
        source: 'public_records',
        confidenceScore: 0
      };
    }
  }

  /**
   * Normalizes address format
   */
  normalizeAddress(address) {
    if (!address) return null;
    return address.trim();
  }

  getName() {
    return 'public_records';
  }
}

module.exports = PublicRecordsProvider;


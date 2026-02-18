// utils/skiptrace/index.js
/**
 * Skip Trace Orchestrator
 * 
 * Runs providers in order and merges results:
 * 1. publicRecordsProvider
 * 2. freemiumApiProvider
 * 3. noopProvider (fallback)
 * 
 * Merges and deduplicates results from all providers
 */

const PublicRecordsProvider = require('./publicRecordsProvider');
const FreemiumApiProvider = require('./freemiumApiProvider');
const NoopProvider = require('./noopProvider');

class SkipTraceOrchestrator {
  constructor() {
    this.providers = [
      new PublicRecordsProvider(),
      new FreemiumApiProvider(),
      new NoopProvider() // Always include as fallback
    ];
  }

  /**
   * Runs skip trace using all enabled providers and merges results
   * @param {Object} lead - Lead document
   * @returns {Promise<Object>} Merged contact enrichment result
   */
  async skipTrace(lead) {
    console.log(`[SkipTrace] Starting skip trace for lead ${lead._id || lead.id}`);

    const results = [];
    const sources = [];

    // Run all enabled providers
    for (const provider of this.providers) {
      if (!provider.isEnabled()) {
        continue;
      }

      try {
        const providerName = provider.getName();
        console.log(`[SkipTrace] Running provider: ${providerName}`);
        
        const result = await provider.skipTrace(lead);
        
        if (result && (result.phones?.length > 0 || result.emails?.length > 0 || result.mailingAddress)) {
          results.push(result);
          sources.push(providerName);
          console.log(`[SkipTrace] ${providerName} found: ${result.phones?.length || 0} phones, ${result.emails?.length || 0} emails`);
        }
      } catch (error) {
        // Never crash - log and continue
        console.error(`[SkipTrace] Provider ${provider.getName()} error:`, error.message);
      }
    }

    // Merge results
    const merged = this.mergeResults(results, sources);

    const phonesCount = merged.phones?.length || 0;
    const emailsCount = merged.emails?.length || 0;
    console.log(`[SkipTrace] Completed - phones: ${phonesCount}, emails: ${emailsCount}, sources: ${sources.join(', ')}`);

    return merged;
  }

  /**
   * Merges results from multiple providers
   */
  mergeResults(results, sources) {
    const merged = {
      phones: [],
      emails: [],
      mailingAddresses: [],
      entityInfo: {
        isLLC: null,
        entityName: null,
        registeredState: null
      },
      source: sources.join(','),
      confidenceScore: 0,
      skipTraceSources: sources
    };

    const phoneSet = new Set();
    const emailSet = new Set();
    const addressSet = new Set();

    // Merge all results
    for (const result of results) {
      // Merge phones
      if (result.phones && Array.isArray(result.phones)) {
        for (const phone of result.phones) {
          const normalized = this.normalizePhone(phone.number || phone);
          if (normalized && !phoneSet.has(normalized)) {
            phoneSet.add(normalized);
            merged.phones.push({
              number: normalized,
              type: phone.type || 'unknown',
              confidence: phone.confidence || 0,
              lastSeen: phone.lastSeen || new Date()
            });
          }
        }
      }

      // Merge emails
      if (result.emails && Array.isArray(result.emails)) {
        for (const email of result.emails) {
          const normalized = this.normalizeEmail(email.email || email);
          if (normalized && !emailSet.has(normalized)) {
            emailSet.add(normalized);
            merged.emails.push({
              email: normalized,
              confidence: email.confidence || 0,
              lastSeen: email.lastSeen || new Date()
            });
          }
        }
      }

      // Merge mailing addresses
      if (result.mailingAddresses && Array.isArray(result.mailingAddresses)) {
        for (const addr of result.mailingAddresses) {
          const normalized = this.normalizeAddress(addr.address || addr);
          if (normalized && !addressSet.has(normalized)) {
            addressSet.add(normalized);
            merged.mailingAddresses.push({
              address: normalized,
              confidence: addr.confidence || 0,
              lastSeen: addr.lastSeen || new Date()
            });
          }
        }
      } else if (result.mailingAddress) {
        const normalized = this.normalizeAddress(result.mailingAddress);
        if (normalized && !addressSet.has(normalized)) {
          addressSet.add(normalized);
          merged.mailingAddresses.push({
            address: normalized,
            confidence: 80,
            lastSeen: new Date()
          });
        }
      }

      // Merge entity info (take first non-null)
      if (result.entityInfo) {
        if (!merged.entityInfo.isLLC && result.entityInfo.isLLC !== null) {
          merged.entityInfo.isLLC = result.entityInfo.isLLC;
        }
        if (!merged.entityInfo.entityName && result.entityInfo.entityName) {
          merged.entityInfo.entityName = result.entityInfo.entityName;
        }
        if (!merged.entityInfo.registeredState && result.entityInfo.registeredState) {
          merged.entityInfo.registeredState = result.entityInfo.registeredState;
        }
      }

      // Take highest confidence score
      if (result.confidenceScore > merged.confidenceScore) {
        merged.confidenceScore = result.confidenceScore;
      }
    }

    return merged;
  }

  /**
   * Normalizes phone number
   */
  normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
    if (phone.startsWith('+')) return phone;
    return digits;
  }

  /**
   * Normalizes email
   */
  normalizeEmail(email) {
    if (!email) return null;
    return email.trim().toLowerCase();
  }

  /**
   * Normalizes address
   */
  normalizeAddress(address) {
    if (!address) return null;
    return address.trim();
  }
}

// Export singleton instance
const orchestrator = new SkipTraceOrchestrator();

module.exports = {
  skipTrace: (lead) => orchestrator.skipTrace(lead),
  SkipTraceOrchestrator
};


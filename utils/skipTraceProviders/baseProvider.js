// utils/skipTraceProviders/baseProvider.js
/**
 * Base interface for skip trace providers
 * All providers must implement these methods
 */

class BaseProvider {
  /**
   * Performs skip trace lookup for a lead
   * @param {Object} lead - Lead document with ownerName, propertyAddress, etc.
   * @returns {Promise<Object>} Normalized skip trace result
   */
  async skipTraceLead(lead) {
    throw new Error('skipTraceLead must be implemented by provider');
  }

  /**
   * Estimates cost for skip trace lookup
   * @param {Object} lead - Lead document
   * @returns {Promise<number>} Estimated cost in cents (or currency unit)
   */
  async estimateCost(lead) {
    throw new Error('estimateCost must be implemented by provider');
  }

  /**
   * Normalizes phone number format
   * @param {string} phone - Raw phone number
   * @returns {string} Normalized phone (E.164 or standard format)
   */
  normalizePhone(phone) {
    if (!phone) return null;
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    // If 10 digits, assume US number, format as +1XXXXXXXXXX
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    // If 11 digits starting with 1, format as +1XXXXXXXXXX
    if (digits.length === 11 && digits[0] === '1') {
      return `+${digits}`;
    }
    // If already has +, return as is (assuming E.164)
    if (phone.startsWith('+')) {
      return phone;
    }
    // Return cleaned digits
    return digits;
  }

  /**
   * Normalizes email format
   * @param {string} email - Raw email
   * @returns {string} Normalized email (lowercase, trimmed)
   */
  normalizeEmail(email) {
    if (!email) return null;
    return email.trim().toLowerCase();
  }

  /**
   * Normalizes address format
   * @param {string} address - Raw address
   * @returns {string} Normalized address
   */
  normalizeAddress(address) {
    if (!address) return null;
    return address.trim();
  }

  /**
   * Deduplicates array of objects by a key field
   * @param {Array} arr - Array of objects
   * @param {string} key - Key to dedupe by
   * @returns {Array} Deduplicated array
   */
  dedupeByKey(arr, key) {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    return arr.filter(item => {
      const value = item && item[key];
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }
}

module.exports = BaseProvider;


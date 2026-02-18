// utils/skiptrace/freemiumApiProvider.js
/**
 * Freemium API Provider
 * Uses free/freemium APIs like People Data Labs or Clearbit
 * 
 * Behavior:
 * - Only runs if API key is present in env
 * - Limits calls to 1 per lead
 * - Never crashes if quota exceeded
 * - Only enriches missing fields
 */
const BaseProvider = require('./baseProvider');

class FreemiumApiProvider extends BaseProvider {
  constructor() {
    super();
    this.apiKey = process.env.PEOPLE_DATA_LABS_API_KEY || process.env.CLEARBIT_API_KEY;
    this.providerName = process.env.PEOPLE_DATA_LABS_API_KEY ? 'people_data_labs' : 
                       (process.env.CLEARBIT_API_KEY ? 'clearbit' : null);
    this.warnedOnce = false;
  }

  /**
   * Checks if provider is enabled (has API key)
   */
  isEnabled() {
    return !!this.apiKey;
  }

  /**
   * Performs skip trace using freemium API
   */
  async skipTrace(lead) {
    // If no API key, return empty result
    if (!this.apiKey) {
      if (!this.warnedOnce) {
        console.warn('[FreemiumApiProvider] No API key found. Provider disabled. Set PEOPLE_DATA_LABS_API_KEY or CLEARBIT_API_KEY to enable.');
        this.warnedOnce = true;
      }
      return {
        phones: [],
        emails: [],
        source: 'freemium_api',
        confidenceScore: 0
      };
    }

    try {
      // Use People Data Labs if available (preferred)
      if (process.env.PEOPLE_DATA_LABS_API_KEY) {
        return await this.skipTraceWithPeopleDataLabs(lead);
      }
      
      // Fallback to Clearbit if available
      if (process.env.CLEARBIT_API_KEY) {
        return await this.skipTraceWithClearbit(lead);
      }

      return {
        phones: [],
        emails: [],
        source: 'freemium_api',
        confidenceScore: 0
      };
    } catch (error) {
      // Never crash - log and return empty result
      console.error(`[FreemiumApiProvider] Error during skip trace:`, error.message);
      return {
        phones: [],
        emails: [],
        source: 'freemium_api',
        confidenceScore: 0
      };
    }
  }

  /**
   * Skip trace using People Data Labs API
   */
  async skipTraceWithPeopleDataLabs(lead) {
    const https = require('https');
    const querystring = require('querystring');

    // Build query from lead data
    const queryParams = {};
    if (lead.ownerName) queryParams.name = lead.ownerName;
    if (lead.propertyAddress) queryParams.location = lead.propertyAddress;
    if (lead.city && lead.state) {
      queryParams.location = `${lead.city}, ${lead.state}`;
    }

    // If we don't have enough data, return empty
    if (!queryParams.name && !queryParams.location) {
      return {
        phones: [],
        emails: [],
        source: 'freemium_api',
        confidenceScore: 0
      };
    }

    return new Promise((resolve) => {
      // Add API key to query params (People Data Labs uses api_key param, not header)
      queryParams.api_key = this.apiKey;
      const queryString = querystring.stringify(queryParams);
      const options = {
        hostname: 'api.peopledatalabs.com',
        path: `/v5/person/enrich?${queryString}`,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const response = JSON.parse(data);
              resolve(this.normalizePeopleDataLabsResponse(response));
            } else if (res.statusCode === 429) {
              // Rate limit exceeded - return empty (non-blocking)
              console.warn('[FreemiumApiProvider] Rate limit exceeded for People Data Labs');
              resolve({
                phones: [],
                emails: [],
                source: 'freemium_api',
                confidenceScore: 0
              });
            } else {
              // Other error - return empty (non-blocking)
              console.warn(`[FreemiumApiProvider] API error ${res.statusCode}: ${data}`);
              resolve({
                phones: [],
                emails: [],
                source: 'freemium_api',
                confidenceScore: 0
              });
            }
          } catch (parseError) {
            console.error('[FreemiumApiProvider] Error parsing response:', parseError);
            resolve({
              phones: [],
              emails: [],
              source: 'freemium_api',
              confidenceScore: 0
            });
          }
        });
      });

      req.on('error', (error) => {
        console.error('[FreemiumApiProvider] Request error:', error);
        resolve({
          phones: [],
          emails: [],
          source: 'freemium_api',
          confidenceScore: 0
        });
      });

      // Set timeout (5 seconds)
      req.setTimeout(5000, () => {
        req.destroy();
        resolve({
          phones: [],
          emails: [],
          source: 'freemium_api',
          confidenceScore: 0
        });
      });

      req.end();
    });
  }

  /**
   * Normalizes People Data Labs API response
   */
  normalizePeopleDataLabsResponse(response) {
    const result = {
      phones: [],
      emails: [],
      source: 'freemium_api',
      confidenceScore: 0
    };

    if (!response || response.status !== 200) {
      return result;
    }

    const person = response.data;
    if (!person) {
      return result;
    }

    // Extract phones
    if (person.phone_numbers && Array.isArray(person.phone_numbers)) {
      result.phones = person.phone_numbers.map(phone => ({
        number: this.normalizePhone(phone.number || phone),
        type: phone.type || 'unknown',
        confidence: 70, // Freemium API confidence
        lastSeen: new Date()
      }));
    }

    // Extract emails
    if (person.emails && Array.isArray(person.emails)) {
      result.emails = person.emails.map(email => ({
        email: this.normalizeEmail(email.address || email),
        confidence: 70,
        lastSeen: new Date()
      }));
    }

    // Calculate confidence score
    if (result.phones.length > 0 || result.emails.length > 0) {
      result.confidenceScore = 70;
    }

    return result;
  }

  /**
   * Skip trace using Clearbit API (stub - can be implemented similarly)
   */
  async skipTraceWithClearbit(lead) {
    // Clearbit implementation would go here
    // For now, return empty (can be implemented later)
    console.log('[FreemiumApiProvider] Clearbit not yet implemented');
    return {
      phones: [],
      emails: [],
      source: 'freemium_api',
      confidenceScore: 0
    };
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

  getName() {
    return this.providerName || 'freemium_api';
  }
}

module.exports = FreemiumApiProvider;


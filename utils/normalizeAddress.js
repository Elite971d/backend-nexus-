/**
 * Normalize a free-form US-style address string for deduplication and light parsing.
 * @param {string} inputAddress
 * @returns {{
 *   normalizedAddress: string,
 *   city: string | null,
 *   state: string | null,
 *   zip: string | null
 * }}
 */
function normalizeAddress(inputAddress) {
  const raw = String(inputAddress ?? '').trim();
  if (!raw) {
    return {
      normalizedAddress: '',
      city: null,
      state: null,
      zip: null,
    };
  }

  let s = raw.toLowerCase().replace(/\s+/g, ' ').trim();

  const abbrev = [
    [/\bstr\b\.?/g, 'street'],
    [/\bst\b\.?/g, 'street'],
    [/\brd\b\.?/g, 'road'],
    [/\bave\b\.?/g, 'avenue'],
    [/\bav\b\.?/g, 'avenue'],
    [/\bblvd\b\.?/g, 'boulevard'],
    [/\bdr\b\.?/g, 'drive'],
    [/\bct\b\.?/g, 'court'],
    [/\bln\b\.?/g, 'lane'],
    [/\bpl\b\.?/g, 'place'],
    [/\bpkwy\b\.?/g, 'parkway'],
    [/\bhwy\b\.?/g, 'highway'],
  ];
  for (const [re, full] of abbrev) {
    s = s.replace(re, full);
  }

  s = s.replace(/\s+/g, ' ').trim();

  const zipMatch = s.match(/\b(\d{5})(?:-(\d{4}))?\b/);
  const zip = zipMatch ? (zipMatch[2] ? `${zipMatch[1]}-${zipMatch[2]}` : zipMatch[1]) : null;

  let city = null;
  let state = null;

  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    city = parts[parts.length - 2] || null;

    const stateZip = last.match(/^([a-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/i);
    if (stateZip) {
      state = stateZip[1].toUpperCase();
    } else {
      const m2 = last.match(/^([a-z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
      if (m2) {
        state = m2[1].toUpperCase();
      } else if (/^[a-z]{2}$/i.test(last)) {
        state = last.toUpperCase();
        city = parts.length >= 3 ? parts[parts.length - 3] : city;
      }
    }
  }

  const normalizedAddress = s;

  return {
    normalizedAddress,
    city,
    state,
    zip,
  };
}

module.exports = { normalizeAddress };

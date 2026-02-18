// utils/complianceChecker.js
// Compliance enforcement utilities

const PROHIBITED_PHRASES = [
  'guarantee',
  'guaranteed',
  'definitely',
  'final offer',
  'promise',
  'promised',
  'assure',
  'assured',
  'certain',
  'certainly'
];

/**
 * Checks text for prohibited phrases
 * @param {String} text - Text to check
 * @returns {Object} { hasViolations, violations }
 */
function checkProhibitedPhrases(text) {
  if (!text || typeof text !== 'string') {
    return { hasViolations: false, violations: [] };
  }

  const lowerText = text.toLowerCase();
  const violations = [];

  PROHIBITED_PHRASES.forEach(phrase => {
    if (lowerText.includes(phrase)) {
      violations.push(phrase);
    }
  });

  return {
    hasViolations: violations.length > 0,
    violations
  };
}

module.exports = {
  checkProhibitedPhrases,
  PROHIBITED_PHRASES
};

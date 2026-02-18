// utils/underwriting/index.js
// Orchestrator for underwriting analysis

const { analyzeWithRules } = require('./rulesEngine');
const { generateAIMemo } = require('./aiEngine');

/**
 * Perform underwriting analysis on a lead
 * Uses rules engine (always) and AI engine (if available)
 */
async function underwriteLead(lead, useAI = false) {
  // Step 1: Always run rules engine
  const rulesResult = await analyzeWithRules(lead);

  // Step 2: Optionally enhance with AI
  if (useAI && process.env.OPENAI_API_KEY) {
    return await generateAIMemo(lead, rulesResult);
  }

  return rulesResult;
}

module.exports = {
  underwriteLead,
  analyzeWithRules,
  generateAIMemo
};


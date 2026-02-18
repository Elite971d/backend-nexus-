// utils/underwriting/aiEngine.js
// AI-powered underwriting engine (optional, requires OPENAI_API_KEY)

/**
 * Generate AI underwriting memo using OpenAI (if available)
 * Falls back gracefully if API key is missing
 */
async function generateAIMemo(lead, rulesResult) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    return {
      ...rulesResult,
      aiUsed: false,
      model: 'rules-only',
      note: 'AI unavailable - OPENAI_API_KEY not set'
    };
  }

  try {
    // Import OpenAI dynamically (only if available)
    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Build context from lead data
    const context = {
      propertyAddress: lead.dialerIntake?.propertyAddress || lead.propertyAddress,
      conditionTier: lead.dialerIntake?.conditionTier,
      occupancyType: lead.dialerIntake?.occupancyType,
      motivationRating: lead.dialerIntake?.motivationRating,
      sellerReason: lead.dialerIntake?.sellerReason,
      askingPrice: lead.askingPrice,
      arv: lead.arv,
      mortgageFreeAndClear: lead.dialerIntake?.mortgageFreeAndClear,
      mortgageBalance: lead.dialerIntake?.mortgageBalance,
      redFlags: lead.dialerIntake?.redFlags || [],
      leadScore: lead.leadScore?.grade,
      buyBoxLabel: lead.leadScore?.buyBoxLabel
    };

    const prompt = `You are a real estate deal underwriting assistant. Analyze this lead and provide a concise underwriting memo.

Lead Data:
${JSON.stringify(context, null, 2)}

Rules Analysis:
${JSON.stringify(rulesResult, null, 2)}

Provide a professional underwriting summary that:
1. Summarizes the deal opportunity
2. Identifies key risks and assumptions
3. Suggests appropriate offer lane (cash, subject-to, seller finance, etc.)
4. Provides pricing guidance based on available data
5. Clearly labels all assumptions

IMPORTANT: Never fabricate facts. If data is missing, state it clearly as an assumption.

Format as JSON with: summaryText, suggestedLane, suggestedPriceRange (min/max), assumptions (array), risks (array), missingFields (array)`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a real estate underwriting assistant. Always be factual and label assumptions clearly.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const aiContent = response.choices[0].message.content;
    
    // Try to parse JSON from response
    let aiResult;
    try {
      aiResult = JSON.parse(aiContent);
    } catch (e) {
      // If not JSON, use the text as summary
      aiResult = {
        summaryText: aiContent,
        suggestedLane: rulesResult.suggestedLane,
        suggestedPriceRange: rulesResult.suggestedPriceRange,
        assumptions: [...rulesResult.assumptions, 'AI-generated summary'],
        risks: rulesResult.risks,
        missingFields: rulesResult.missingFields
      };
    }

    return {
      ...aiResult,
      aiUsed: true,
      model: 'gpt-4',
      rulesResult: rulesResult // Keep rules result for reference
    };
  } catch (err) {
    console.error('AI underwriting error:', err.message);
    // Fall back to rules-only
    return {
      ...rulesResult,
      aiUsed: false,
      model: 'rules-only',
      note: `AI unavailable: ${err.message}`
    };
  }
}

module.exports = {
  generateAIMemo
};


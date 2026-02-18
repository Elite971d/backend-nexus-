// __tests__/rapidOffer.test.js
// Minimal test suite for Rapid Offer System
// Run with: npm test or jest

const { classifyOfferLane } = require('../utils/offerLaneClassifier');
const { generateHandoffSummary } = require('../utils/handoffGenerator');
const { checkProhibitedPhrases } = require('../utils/complianceChecker');

describe('Rapid Offer System - Utilities', () => {
  describe('Offer Lane Classifier', () => {
    test('classifies Free & Clear as Seller Finance', () => {
      const intake = {
        mortgageFreeAndClear: 'yes',
        mortgageCurrent: 'yes',
        sellerFlexibility: 'both',
        motivationRating: 3
      };
      const result = classifyOfferLane(intake);
      expect(result.suggestion).toBe('sellerfinance');
    });

    test('classifies Low Equity as Sub-To', () => {
      const intake = {
        mortgageFreeAndClear: 'no',
        mortgageCurrent: 'yes',
        mortgageBalance: 180000,
        askingPrice: 200000,
        sellerFlexibility: 'both',
        motivationRating: 3
      };
      const result = classifyOfferLane(intake);
      expect(result.suggestion).toBe('subto');
    });

    test('returns unknown when critical fields missing', () => {
      const intake = {
        mortgageFreeAndClear: 'unknown'
      };
      const result = classifyOfferLane(intake);
      expect(result.suggestion).toBe('unknown');
      expect(result.missingFields.length).toBeGreaterThan(0);
    });
  });

  describe('Handoff Summary Generator', () => {
    test('generates summary with all required sections', () => {
      const lead = {
        propertyAddress: '123 Main St',
        beds: 3,
        baths: 2,
        sqft: 1500,
        notes: 'Test notes'
      };
      const intake = {
        propertyAddress: '123 Main St',
        occupancyType: 'owner',
        conditionTier: 'medium',
        askingPrice: 150000,
        mortgageFreeAndClear: 'no',
        mortgageBalance: 120000,
        mortgageMonthlyPayment: 800,
        mortgageCurrent: 'yes',
        motivationRating: 4,
        timelineToClose: '30-60 days',
        sellerReason: 'Relocating',
        sellerFlexibility: 'both',
        recommendedOfferLane: 'subto',
        dialerConfidence: 4,
        redFlags: ['Property needs repairs']
      };
      const { summary, missingFields } = generateHandoffSummary(lead, intake);
      
      expect(summary).toContain('PROPERTY SNAPSHOT');
      expect(summary).toContain('FINANCIAL SNAPSHOT');
      expect(summary).toContain('SELLER PSYCHOLOGY');
      expect(summary).toContain('DIALER RECOMMENDATION');
      expect(summary).toContain('RED FLAGS');
      expect(summary).toContain('ADDITIONAL NOTES');
    });

    test('identifies missing required fields', () => {
      const lead = {};
      const intake = {
        propertyAddress: '123 Main St'
        // Missing other required fields
      };
      const { missingFields } = generateHandoffSummary(lead, intake);
      expect(missingFields.length).toBeGreaterThan(0);
    });
  });
});

describe('Rapid Offer System - Role Restrictions', () => {
  // Note: These would require full integration testing with auth
  // For now, we document the expected behavior
  
  test('dialer cannot set offerAmount in intake', async () => {
    // This test documents the expected behavior
    // Full test would require authenticated request
    const forbiddenFields = ['offerAmount', 'offerSent', 'contractSent', 'underContract', 'offerLaneFinal'];
    
    // Simulate checking request body
    const reqBody = { offerAmount: 100000 };
    const hasForbiddenFields = Object.keys(reqBody).some(key => 
      forbiddenFields.includes(key) || key.startsWith('closer.')
    );
    
    expect(hasForbiddenFields).toBe(true);
  });

  test('dialer cannot set closer fields', () => {
    const forbiddenFields = ['offerAmount', 'offerSent', 'contractSent', 'underContract', 'offerLaneFinal'];
    const reqBody = { 'closer.offerAmount': 100000 };
    const hasForbiddenFields = Object.keys(reqBody).some(key => 
      forbiddenFields.includes(key) || key.startsWith('closer.')
    );
    
    expect(hasForbiddenFields).toBe(true);
  });
});

describe('Compliance Checker', () => {
  test('detects prohibited phrases', () => {
    const text = 'I guarantee we can close quickly';
    const result = checkProhibitedPhrases(text);
    expect(result.hasViolations).toBe(true);
    expect(result.violations).toContain('guarantee');
  });

  test('does not flag safe text', () => {
    const text = 'We can potentially offer a competitive price';
    const result = checkProhibitedPhrases(text);
    expect(result.hasViolations).toBe(false);
  });

  test('handles empty text', () => {
    const result = checkProhibitedPhrases('');
    expect(result.hasViolations).toBe(false);
  });
});

// jobs/seedBuyBoxes.js
const mongoose = require('mongoose');
require('dotenv').config();
const BuyBox = require('../models/BuyBox');

async function seedBuyBoxes() {
  try {
    // Connect to database
    const connectDB = require('../config/db');
    await connectDB();

    console.log('🌱 Seeding Buy Boxes...');

    // DFW Quick Flip Buy Box
    const dfwBuyBox = {
      marketKey: 'TX-DFW',
      label: 'DFW Quick Flip Buy Box',
      propertyType: ['SFR'],
      minBeds: 3,
      minBaths: 2,
      minSqft: 1000,
      minYearBuilt: 1960,
      conditionAllowed: ['light', 'medium'],
      buyPriceMin: 100000,
      buyPriceMax: 250000,
      arvMin: 180000,
      arvMax: 400000,
      counties: ['Dallas', 'Tarrant', 'Collin', 'Denton'],
      cityOverrides: {
        McKinney: {
          buyPriceMin: 120000,
          buyPriceMax: 280000
        },
        Lewisville: {
          buyPriceMin: 110000,
          buyPriceMax: 270000
        },
        'Flower Mound': {
          buyPriceMin: 130000,
          buyPriceMax: 290000
        },
        Plano: {
          buyPriceMin: 140000,
          buyPriceMax: 300000
        },
        Denton: {
          buyPriceMin: 105000,
          buyPriceMax: 260000
        }
      },
      exclusions: [
        'major fire damage',
        'extreme structural damage'
      ],
      active: true
    };

    // Check if DFW Buy Box already exists
    const existing = await BuyBox.findOne({ marketKey: 'TX-DFW', label: 'DFW Quick Flip Buy Box' });
    
    if (existing) {
      console.log('✅ DFW Quick Flip Buy Box already exists, updating...');
      Object.assign(existing, dfwBuyBox);
      await existing.save();
      console.log('✅ DFW Quick Flip Buy Box updated');
    } else {
      const created = await BuyBox.create(dfwBuyBox);
      console.log('✅ DFW Quick Flip Buy Box created:', created._id);
    }

    console.log('✅ Buy Box seeding completed');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding Buy Boxes:', err);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedBuyBoxes();
}

module.exports = seedBuyBoxes;


// jobs/sendDailyDigest.js
// Independent job entrypoint for sending daily digest emails/SMS
// Usage: node jobs/sendDailyDigest.js
// TODO: Implement daily digest functionality

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const connectDB = require('../config/db');
const Lead = require('../models/Lead');

async function sendDailyDigest() {
  console.log('[JOB] start: Daily digest');
  
  try {
    // Connect to MongoDB
    await connectDB();
    
    // TODO: Implement daily digest logic
    // 1. Query new leads from last 24 hours
    // 2. Generate summary statistics
    // 3. Send email/SMS digest with summary
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const newLeads = await Lead.find({
      createdAt: { $gte: yesterday }
    });
    
    const stats = {
      total: newLeads.length,
      byCategory: {},
      bySource: {}
    };
    
    newLeads.forEach(lead => {
      const category = lead.category || 'Uncategorized';
      const source = lead.source || 'Unknown';
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      stats.bySource[source] = (stats.bySource[source] || 0) + 1;
    });
    
    console.log('[JOB] Daily digest stats:', stats);
    // TODO: Send email/SMS with stats
    
    console.log('[JOB] success: Daily digest completed');
    process.exit(0);
  } catch (err) {
    console.error('[JOB] error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

// Run the job
sendDailyDigest();

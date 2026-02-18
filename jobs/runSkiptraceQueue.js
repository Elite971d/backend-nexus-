// jobs/runSkiptraceQueue.js
// Independent job entrypoint for running skiptrace queue
// Usage: node jobs/runSkiptraceQueue.js
// TODO: Implement skiptrace queue processing

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const connectDB = require('../config/db');
const Lead = require('../models/Lead');
const { performSkiptrace } = require('../skiptrace');

async function runSkiptraceQueue() {
  console.log('[JOB] start: Skiptrace queue');
  
  try {
    // Connect to MongoDB
    await connectDB();
    
    // TODO: Implement queue processing logic
    // 1. Find leads that need skiptrace (e.g., status='new', no phone/email)
    // 2. Process each lead through skiptrace service
    // 3. Update lead with contact information
    // 4. Mark as processed
    
    const leadsToProcess = await Lead.find({
      status: 'new',
      $or: [
        { phone: { $exists: false } },
        { email: { $exists: false } }
      ]
    }).limit(100);
    
    console.log(`[JOB] Found ${leadsToProcess.length} leads to process`);
    
    for (const lead of leadsToProcess) {
      try {
        const results = await performSkiptrace(lead);
        // TODO: Update lead with results
        console.log(`[JOB] Processed lead ${lead._id}`);
      } catch (err) {
        console.error(`[JOB] error processing lead ${lead._id}:`, err.message);
      }
    }
    
    console.log('[JOB] success: Skiptrace queue completed');
    process.exit(0);
  } catch (err) {
    console.error('[JOB] error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

// Run the job
runSkiptraceQueue();

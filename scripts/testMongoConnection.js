#!/usr/bin/env node
/**
 * Test MongoDB connection with detailed diagnostics
 * Usage: node scripts/testMongoConnection.js [connection_string]
 * If no connection string provided, uses MONGO_URI from environment
 */

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const mongoose = require('mongoose');

async function testConnection(uri) {
  console.log('\n🧪 Testing MongoDB Connection...\n');
  console.log('='.repeat(60));
  
  if (!uri) {
    uri = process.env.MONGO_URI;
  }
  
  if (!uri) {
    console.error('❌ No connection string provided and MONGO_URI not set');
    console.error('Usage: node scripts/testMongoConnection.js "mongodb://..."');
    console.error('   or set MONGO_URI environment variable');
    process.exit(1);
  }
  
  // Mask password in output
  const maskedUri = uri.replace(/:([^:@]+)@/, ':***@');
  console.log(`Connection String: ${maskedUri}\n`);
  
  // Parse URI to show components (without password)
  try {
    const urlPattern = /^mongodb(\+srv)?:\/\/([^:]+):([^@]+)@([^\/]+)\/([^?]+)(\?.+)?$/;
    const match = uri.match(urlPattern);
    
    if (match) {
      const [, protocol, username, password, host, database, queryString] = match;
      console.log('Parsed Components:');
      console.log(`  Protocol:  mongodb${protocol === '+srv' ? '+srv' : ''}`);
      console.log(`  Username:  ${username}`);
      console.log(`  Password:  ${password.substring(0, 3)}... (${password.length} chars)`);
      console.log(`  Host:      ${host}`);
      console.log(`  Database:  ${database}`);
      if (queryString) {
        console.log(`  Params:    ${queryString.substring(1)}`);
      }
      console.log('');
    }
  } catch (e) {
    // Ignore parsing errors
  }
  
  console.log('Attempting connection...\n');
  
  try {
    // Set connection options
    const options = {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    };
    
    const startTime = Date.now();
    await mongoose.connect(uri, options);
    const connectTime = Date.now() - startTime;
    
    console.log('✅ Connection successful!\n');
    console.log(`  Connection time: ${connectTime}ms`);
    console.log(`  Connection state: ${mongoose.connection.readyState}`);
    
    // Test a simple operation
    try {
      const adminDb = mongoose.connection.db.admin();
      const serverStatus = await adminDb.serverStatus();
      console.log(`  Server version: ${serverStatus.version}`);
      
      // List databases
      const admin = mongoose.connection.db.admin();
      const { databases } = await admin.listDatabases();
      console.log(`  Available databases: ${databases.length}`);
      
      // Get current database stats
      const dbStats = await mongoose.connection.db.stats();
      console.log(`  Current database: ${dbStats.db}`);
      console.log(`  Collections: ${dbStats.collections}`);
      
    } catch (statsError) {
      console.log('  ⚠️  Could not retrieve server info (may lack permissions)');
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Test completed successfully!\n');
    process.exit(0);
    
  } catch (err) {
    console.error('\n❌ Connection failed!\n');
    console.error(`Error: ${err.message}\n`);
    
    // Provide specific guidance based on error type
    if (err.message.includes('bad auth') || err.message.includes('authentication failed')) {
      console.error('🔐 Authentication Error Detected\n');
      console.error('This usually means:');
      console.error('  1. Username or password is incorrect');
      console.error('  2. Password special characters are not URL-encoded');
      console.error('  3. authSource parameter is incorrect');
      console.error('  4. User does not exist or was created in a different database\n');
      console.error('Troubleshooting steps:');
      console.error('  - Run: node scripts/encodeMongoPassword.js "your_password"');
      console.error('  - Run: node scripts/validateMongoUri.js "your_connection_string"');
      console.error('  - Verify user exists: db.getUsers()');
      console.error('  - Check authSource matches user location\n');
    } else if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
      console.error('🌐 Network Error Detected\n');
      console.error('This usually means:');
      console.error('  1. Host/port is incorrect or unreachable');
      console.error('  2. Firewall is blocking connections');
      console.error('  3. MongoDB server is not running\n');
      console.error('Troubleshooting steps:');
      console.error('  - Verify host and port are correct');
      console.error('  - Check firewall rules (MongoDB Atlas: Network Access)');
      console.error('  - Test connectivity: nc -zv host 27017\n');
    } else if (err.message.includes('timeout')) {
      console.error('⏱️  Timeout Error Detected\n');
      console.error('This usually means:');
      console.error('  1. Network connectivity issues');
      console.error('  2. Firewall blocking connection');
      console.error('  3. MongoDB server is slow or overloaded\n');
    }
    
    console.error('Run troubleshooting guide:');
    console.error('  node scripts/troubleshootMongoConnection.js\n');
    
    process.exit(1);
  }
}

// Get connection string from command line or environment
const connectionString = process.argv[2];
testConnection(connectionString);


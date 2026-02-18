// config/db.js
const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/elitenexus';
  
  // Validate MONGO_URI in production
  if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI) {
    const error = new Error('MONGO_URI environment variable is required in production');
    console.error('❌ Configuration Error:', error.message);
    console.error('   Please set MONGO_URI environment variable in Fly.io:');
    console.error('   fly secrets set MONGO_URI="your_mongodb_connection_string"');
    throw error;
  }
  
  // Validate connection string format
  if (uri && !uri.match(/^mongodb(\+srv)?:\/\//)) {
    const error = new Error('MONGO_URI must start with mongodb:// or mongodb+srv://');
    console.error('❌ Configuration Error:', error.message);
    console.error('   Invalid connection string format detected.');
    console.error('   Expected format: mongodb://username:password@host:port/database?authSource=admin');
    console.error('   or: mongodb+srv://username:password@cluster.mongodb.net/database?authSource=admin');
    console.error('');
    console.error('   Current value appears to be missing the protocol prefix.');
    console.error('   Please update: fly secrets set MONGO_URI="mongodb://..."');
    throw error;
  }
  
  // Warn if using default URI in non-production
  if (!process.env.MONGO_URI && process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  Using default MongoDB URI. Set MONGO_URI environment variable for production.');
  }
  
  try {
    await mongoose.connect(uri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      socketTimeoutMS: 45000, // 45 second socket timeout
    });
    console.log('✅ MongoDB connected');
    return true;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    
    // Handle parsing/format errors
    if (err.message && (err.message.includes('Unable to parse') || err.message.includes('Invalid connection string'))) {
      console.error('   📝 Connection string format error. Common fixes:');
      console.error('   1. Must start with mongodb:// or mongodb+srv://');
      console.error('   2. Format: mongodb://username:password@host:port/database?authSource=admin');
      console.error('   3. For MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/database?authSource=admin');
      console.error('   4. URL-encode special characters in password');
      console.error('   5. Check for missing quotes or escaping issues');
      console.error('');
      console.error('   To update: fly secrets set MONGO_URI="mongodb://..."');
    } else if (err.message && (err.message.includes('bad auth') || err.message.includes('authentication failed'))) {
      console.error('   🔐 Authentication failed. Common fixes:');
      console.error('   1. Check username and password are correct');
      console.error('   2. URL-encode special characters in password (@ = %40, : = %3A, # = %23, % = %25)');
      console.error('   3. Ensure authSource parameter is correct (usually "admin")');
      console.error('   4. Verify user has permissions on the database');
      console.error('   Example: mongodb://user:password%40with%23chars@host:27017/dbname?authSource=admin');
      console.error('');
      console.error('   To update: fly secrets set MONGO_URI="your_connection_string"');
    } else if (err.name === 'MongoServerSelectionError') {
      console.error('   This usually means MongoDB is unreachable. Check:');
      console.error('   - MONGO_URI is correct');
      console.error('   - MongoDB server is running and accessible');
      console.error('   - Network/firewall allows connections');
    }
    throw err; // Let caller handle the error
  }
}

module.exports = connectDB;
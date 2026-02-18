#!/usr/bin/env node
/**
 * Helper script to validate MongoDB connection string format
 * Usage: node scripts/validateMongoUri.js "<connection_string>"
 * 
 * Note: This validates format only, it does NOT test the actual connection
 */

const uri = process.argv[2];

if (!uri) {
  console.error('Usage: node scripts/validateMongoUri.js "<connection_string>"');
  console.error('\nExample:');
  console.error('  node scripts/validateMongoUri.js "mongodb://user:pass@host:27017/dbname?authSource=admin"');
  console.error('\nTo encode a password:');
  console.error('  node scripts/encodeMongoPassword.js "your_password"');
  process.exit(1);
}

console.log('\n🔍 Validating MongoDB Connection String...\n');

try {
  // Basic validation - check for required components
  const urlPattern = /^mongodb(\+srv)?:\/\/([^:]+):([^@]+)@([^\/]+)\/([^?]+)(\?.+)?$/;
  const match = uri.match(urlPattern);
  
  if (!match) {
    console.error('❌ Invalid connection string format');
    console.error('\nExpected format:');
    console.error('  mongodb://username:password@host:port/database?authSource=admin');
    console.error('  or');
    console.error('  mongodb+srv://username:password@cluster.mongodb.net/database?authSource=admin');
    console.error('\nPlease check:');
    console.error('  - Username and password are present');
    console.error('  - Host and port are specified');
    console.error('  - Database name is included');
    process.exit(1);
  }
  
  const [, protocol, username, password, host, database, queryString] = match;
  const isSrv = protocol === '+srv';
  
  console.log('✅ Connection string format is valid\n');
  console.log('📋 Parsed components:');
  console.log(`   Protocol:    mongodb${isSrv ? '+srv' : ''}`);
  console.log(`   Username:    ${username}`);
  
  // Check if password contains special characters that might need encoding
  const specialChars = /[@:#%\/\?\&=\[\]{}]/;
  const decodedPassword = decodeURIComponent(password);
  if (specialChars.test(decodedPassword) && decodedPassword === password) {
    console.log(`   ⚠️  Password:    ${password.substring(0, 3)}... (may need URL encoding)`);
    console.log(`   ⚠️  Password contains special characters but appears unencoded`);
    console.log(`   💡 Use: node scripts/encodeMongoPassword.js "${decodedPassword}"`);
  } else {
    console.log(`   Password:    ${password.substring(0, 3)}... (appears properly encoded)`);
  }
  
  console.log(`   Host:        ${host}`);
  console.log(`   Database:    ${database}`);
  
  if (queryString) {
    const params = new URLSearchParams(queryString.substring(1));
    console.log(`   Parameters:  ${Array.from(params.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    
    if (!params.has('authSource')) {
      console.log(`   ⚠️  Warning: authSource parameter not found`);
      console.log(`   💡 Add ?authSource=admin if your user is in the admin database`);
    }
  } else {
    console.log(`   ⚠️  Parameters:  None (consider adding ?authSource=admin)`);
  }
  
  console.log('\n✅ Connection string appears properly formatted');
  console.log('\n🚀 To set in Fly.io:');
  console.log(`   fly secrets set MONGO_URI="${uri}"`);
  console.log('\n💡 Common issues to check:');
  console.log('   1. Username and password are correct');
  console.log('   2. Password special characters are URL-encoded');
  console.log('   3. User has permissions on the specified database');
  console.log('   4. authSource matches where the user was created');
  console.log('   5. Network/firewall allows connections from Fly.io IPs');
  console.log('');
  
} catch (err) {
  console.error('❌ Error validating connection string:', err.message);
  process.exit(1);
}


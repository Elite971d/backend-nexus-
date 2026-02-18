#!/usr/bin/env node
/**
 * Helper script to URL-encode MongoDB password for connection strings
 * Usage: node scripts/encodeMongoPassword.js <password>
 */

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/encodeMongoPassword.js <password>');
  console.error('Example: node scripts/encodeMongoPassword.js "p@ssw:rd#123"');
  process.exit(1);
}

const encoded = encodeURIComponent(password);
console.log('\n📝 Password Encoding:');
console.log('   Original:  ', password);
console.log('   Encoded:   ', encoded);
console.log('\n💡 Use the encoded password in your MONGO_URI:');
console.log(`   mongodb://username:${encoded}@host:27017/database?authSource=admin`);
console.log('\n🚀 To set in Fly.io:');
console.log(`   fly secrets set MONGO_URI="mongodb://username:${encoded}@host:27017/database?authSource=admin"`);
console.log('');

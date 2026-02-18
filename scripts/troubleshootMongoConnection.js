#!/usr/bin/env node
/**
 * Comprehensive MongoDB connection troubleshooting guide
 * This script helps diagnose MongoDB authentication and connection issues
 */

console.log('\n🔍 MongoDB Connection Troubleshooting Guide\n');
console.log('='.repeat(60));
console.log('\nCommon Issues and Solutions:\n');

const issues = [
  {
    number: 1,
    title: 'Username and password are correct',
    checks: [
      '✓ Verify the username matches exactly (case-sensitive)',
      '✓ Verify the password matches exactly (case-sensitive)',
      '✓ Check if the user exists in MongoDB:',
      '  - Connect to MongoDB: mongo "mongodb://admin:password@host:27017/admin"',
      '  - List users: db.getUsers()',
      '  - Or check specific user: db.getUser("your_username")',
      '✓ If using MongoDB Atlas, check the Database Access page',
      '✓ Try connecting with MongoDB Compass or mongosh to verify credentials'
    ]
  },
  {
    number: 2,
    title: 'Password special characters are URL-encoded',
    checks: [
      '✓ Special characters MUST be URL-encoded in connection strings',
      '✓ Common encodings:',
      '  - @ → %40',
      '  - : → %3A',
      '  - # → %23',
      '  - % → %25',
      '  - / → %2F',
      '  - ? → %3F',
      '  - & → %26',
      '  - = → %3D',
      '  - [ → %5B',
      '  - ] → %5D',
      '  - { → %7B',
      '  - } → %7D',
      '✓ Use the helper script: node scripts/encodeMongoPassword.js "your_password"',
      '✓ Example: Password "p@ssw:rd#123" becomes "p%40ssw%3Ard%23123"',
      '✓ Use validateMongoUri.js to check if encoding is needed'
    ]
  },
  {
    number: 3,
    title: 'User has permissions on the specified database',
    checks: [
      '✓ Verify the user has read/write permissions on the target database',
      '✓ Check user roles: db.getUser("your_username")',
      '✓ Common required roles:',
      '  - readWrite: for read and write operations',
      '  - dbAdmin: for administrative tasks',
      '  - userAdmin: for user management',
      '✓ For MongoDB Atlas:',
      '  - Go to Database Access → Edit user → Built-in Role',
      '  - Select "Read and write to any database" or specific database',
      '✓ Test permissions by connecting and running a simple query'
    ]
  },
  {
    number: 4,
    title: 'authSource matches where the user was created',
    checks: [
      '✓ authSource tells MongoDB which database contains the user credentials',
      '✓ If user was created in "admin" database, use: ?authSource=admin',
      '✓ If user was created in your app database, use: ?authSource=your_database_name',
      '✓ Default authSource is the database name in the connection string',
      '✓ Check where user exists:',
      '  - Connect to admin: mongo "mongodb://admin@host:27017/admin"',
      '  - Run: use admin; db.getUsers()',
      '  - Or: use your_database; db.getUsers()',
      '✓ MongoDB Atlas users are typically in "admin" database',
      '✓ If unsure, try both: ?authSource=admin and without authSource'
    ]
  },
  {
    number: 5,
    title: 'Network/firewall allows connections from Fly.io IPs',
    checks: [
      '✓ MongoDB Atlas:',
      '  - Go to Network Access → IP Access List',
      '  - Add 0.0.0.0/0 (allow all) for testing',
      '  - Or add specific Fly.io IP ranges (check Fly.io docs)',
      '  - Wait a few minutes for changes to propagate',
      '✓ Self-hosted MongoDB:',
      '  - Check firewall rules allow port 27017 (or 27017-27019)',
      '  - Verify MongoDB bindIp allows external connections',
      '  - Check MongoDB config: net.bindIp = 0.0.0.0 (or specific IPs)',
      '✓ Test connectivity from Fly.io machine:',
      '  - SSH: fly ssh console',
      '  - Run: nc -zv your_mongo_host 27017',
      '  - Or: telnet your_mongo_host 27017',
      '✓ MongoDB Atlas should show connection attempts in logs'
    ]
  }
];

issues.forEach(issue => {
  console.log(`${issue.number}. ${issue.title}`);
  console.log('─'.repeat(60));
  issue.checks.forEach(check => {
    console.log(`  ${check}`);
  });
  console.log('');
});

console.log('='.repeat(60));
console.log('\n📋 Quick Diagnostic Steps:\n');

console.log('Step 1: Validate your connection string format');
console.log('  node scripts/validateMongoUri.js "your_connection_string"\n');

console.log('Step 2: Encode password if needed');
console.log('  node scripts/encodeMongoPassword.js "your_password"\n');

console.log('Step 3: Test connection from Fly.io');
console.log('  fly ssh console');
console.log('  # Then inside the container:');
console.log('  node -e "require(\'mongoose\').connect(process.env.MONGO_URI).then(() => console.log(\'✅ Connected\')).catch(e => console.error(\'❌\', e.message))"\n');

console.log('Step 4: Check Fly.io logs for detailed errors');
console.log('  fly logs\n');

console.log('Step 5: Verify secret is set correctly');
console.log('  fly secrets list\n');

console.log('💡 Additional Resources:');
console.log('  - MongoDB Connection String: https://www.mongodb.com/docs/manual/reference/connection-string/');
console.log('  - MongoDB Atlas Connection: https://www.mongodb.com/docs/atlas/connect-to-cluster/');
console.log('  - Fly.io Secrets: https://fly.io/docs/reference/secrets/\n');


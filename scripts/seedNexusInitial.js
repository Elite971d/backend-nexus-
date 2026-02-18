// scripts/seedNexusInitial.js
// Run once to create default tenant + initial Admin user (e.g. node scripts/seedNexusInitial.js)
// Requires: MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD

require('dotenv').config();
const connectDB = require('../config/db');
const seedAdmin = require('./seedAdmin');

async function main() {
  await connectDB();
  await seedAdmin();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

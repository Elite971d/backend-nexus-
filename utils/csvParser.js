// utils/csvParser.js
// CSV parsing utility for file uploads

const { parse } = require('csv-parse/sync');

/**
 * Parses a CSV buffer into an array of objects
 * @param {Buffer} buffer - CSV file buffer
 * @returns {Promise<Array<Object>>} - Array of parsed records
 */
async function parseCsvBuffer(buffer) {
  try {
    const records = parse(buffer.toString('utf-8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    });
    return records;
  } catch (err) {
    throw new Error(`CSV parsing error: ${err.message}`);
  }
}

module.exports = {
  parseCsvBuffer
};

// scrapers/index.js
// Exports all county scrapers

const scrapeDallasCounty = require('./dallasScraper');
const scrapeCollinCounty = require('./collinScraper');
const scrapeTarrantCounty = require('./tarrantScraper');
const scrapeHarrisCounty = require('./harrisScraper');

module.exports = {
  dallas: scrapeDallasCounty,
  collin: scrapeCollinCounty,
  tarrant: scrapeTarrantCounty,
  harris: scrapeHarrisCounty
};

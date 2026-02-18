// controllers/exportController.js
const Preforeclosure = require('../models/PreForeclosure');
const TaxLien = require('../models/TaxLien');
const CodeViolation = require('../models/CodeViolation');
const Probate = require('../models/Probate');

function toCsv(rows, fields) {
  const header = fields.join(',');
  const body = rows
    .map(r =>
      fields
        .map(f => {
          const val = r[f] != null ? String(r[f]) : '';
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(',')
    )
    .join('\n');
  return header + '\n' + body;
}

exports.exportPreforeclosures = async (req, res, next) => {
  try {
    const rows = await Preforeclosure.find().lean();
    const csv = toCsv(rows, [
      'county',
      'ownerName',
      'propertyAddress',
      'amountDelinquent',
      'auctionDate'
    ]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="preforeclosures.csv"'
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

exports.exportTaxLiens = async (req, res, next) => {
  try {
    const rows = await TaxLien.find().lean();
    const csv = toCsv(rows, [
      'county',
      'ownerName',
      'propertyAddress',
      'delinquentAmount',
      'yearsOwed'
    ]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="taxliens.csv"'
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

exports.exportCodeViolations = async (req, res, next) => {
  try {
    const rows = await CodeViolation.find().lean();
    const csv = toCsv(rows, [
      'county',
      'ownerName',
      'propertyAddress',
      'violationType',
      'openedDate'
    ]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="codeviolations.csv"'
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

exports.exportProbate = async (req, res, next) => {
  try {
    const rows = await Probate.find().lean();
    const csv = toCsv(rows, [
      'county',
      'executorName',
      'attorneyName',
      'estateAddress',
      'caseNumber'
    ]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="probate.csv"'
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
};
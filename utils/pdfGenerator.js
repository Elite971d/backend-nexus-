// utils/pdfGenerator.js
// PDF generation utility for lead letters

const PDFDocument = require('pdfkit');

/**
 * Generates a PDF letter for a lead and streams it to the response
 * @param {Object} lead - Lead document from MongoDB
 * @param {Object} res - Express response object
 */
function generateLeadLetter(lead, res) {
  try {
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lead-${lead._id}-letter.pdf"`
    );
    
    // Pipe PDF to response
    doc.pipe(res);
    
    // Generate letter content
    doc.fontSize(20).text('Lead Information Letter', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(12);
    doc.text(`Lead ID: ${lead._id}`);
    doc.text(`Owner Name: ${lead.ownerName || 'N/A'}`);
    doc.text(`Property Address: ${lead.propertyAddress || 'N/A'}`);
    doc.text(`Mailing Address: ${lead.mailingAddress || 'N/A'}`);
    
    if (lead.city || lead.state || lead.zip) {
      doc.text(`Location: ${[lead.city, lead.state, lead.zip].filter(Boolean).join(', ')}`);
    }
    
    if (lead.askingPrice) {
      doc.text(`Asking Price: $${lead.askingPrice.toLocaleString()}`);
    }
    
    if (lead.category) {
      doc.text(`Category: ${lead.category}`);
    }
    
    if (lead.status) {
      doc.text(`Status: ${lead.status}`);
    }
    
    if (lead.notes) {
      doc.moveDown();
      doc.text('Notes:');
      doc.text(lead.notes);
    }
    
    // Finalize PDF
    doc.end();
  } catch (err) {
    res.status(500).json({ error: `PDF generation error: ${err.message}` });
  }
}

module.exports = {
  generateLeadLetter
};

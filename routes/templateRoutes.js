// routes/templateRoutes.js
const express = require('express');
const router = express.Router();
const authRequired = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const templateController = require('../controllers/templateController');

// Get templates - all authenticated users (role-based filtering in controller)
router.get('/', authRequired, templateController.getTemplates);

// Get template versions by key (admin/manager only)
router.get('/key/:key', authRequired, requireRole('admin', 'manager'), templateController.getTemplateVersions);

// Get single template - all authenticated users
router.get('/:id', authRequired, templateController.getTemplate);

// Create/update/delete - admin/manager only
router.post('/', authRequired, requireRole('admin', 'manager'), templateController.createTemplate);
router.put('/:id', authRequired, requireRole('admin', 'manager'), templateController.updateTemplate);
router.delete('/:id', authRequired, requireRole('admin', 'manager'), templateController.deleteTemplate);

// Lifecycle actions - admin/manager only
router.post('/:id/approve', authRequired, requireRole('admin', 'manager'), templateController.approveTemplate);
router.post('/:id/activate', authRequired, requireRole('admin', 'manager'), templateController.activateTemplate);
router.post('/:id/archive', authRequired, requireRole('admin', 'manager'), templateController.archiveTemplate);

module.exports = router;

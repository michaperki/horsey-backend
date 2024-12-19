// backend/routes/lichess.js
const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { validateResultHandler } = require('../controllers/lichessController');

// Define the POST route with the handler
router.post('/validate-result', authenticateToken, authorizeRole('admin'), validateResultHandler);

module.exports = router;

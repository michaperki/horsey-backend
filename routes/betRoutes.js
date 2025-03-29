
// Updating routes/betRoutes.js to include validation

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getAvailableSeekers, getBetHistory, placeBet, acceptBet, cancelBet } = require('../controllers/betController');
const { validate, placeBetValidation, betHistoryValidation, acceptBetValidation } = require('../middleware/validationMiddleware');
const { param } = require('express-validator');

// GET /bets/seekers
router.get('/seekers', authenticateToken, getAvailableSeekers);

// GET /bets/history with validation
router.get('/history', authenticateToken, validate(betHistoryValidation), getBetHistory);

// POST /bets/place with validation
router.post('/place', authenticateToken, validate(placeBetValidation), placeBet);

// POST /bets/accept/:betId with validation
router.post('/accept/:betId', authenticateToken, validate(acceptBetValidation), acceptBet);

// POST /bets/cancel/:betId
router.post('/cancel/:betId', authenticateToken, validate([
  param('betId').custom(value => {
    if (!/^[0-9a-fA-F]{24}$/.test(value)) {
      throw new Error('Invalid bet ID format');
    }
    return true;
  })
]), cancelBet);

module.exports = router;

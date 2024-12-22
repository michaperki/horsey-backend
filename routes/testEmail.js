// backend/routes/testEmail.js
const express = require('express');
const emailService = require('../services/emailService');
const router = express.Router();

router.get('/send-test-email', async (req, res) => {
  try {
    const result = await emailService.sendEmail(
      'recipient@example.com',
      'Test Email',
      'This is a test email sent from the Chess Betting platform.'
    );

    if (!result.success) {
      return res.status(500).json({ error: 'Failed to send test email.' });
    }

    res.status(200).json({ message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Unexpected error while sending test email:', error);
    res.status(500).json({ error: 'Failed to send test email.' });
  }
});

module.exports = router;

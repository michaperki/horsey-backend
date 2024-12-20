// backend/routes/testEmail.js
const express = require('express');
const router = express.Router();
const { sendEmail } = require('../services/emailService');

router.get('/send-test-email', async (req, res) => {
  const testEmail = 'recipient@example.com'; // Replace with your email for testing
  const subject = 'Test Email';
  const text = 'This is a test email sent from the Chess Betting platform.';
  
  const result = await sendEmail(testEmail, subject, text);
  
  if (result.success) {
    res.json({ message: 'Test email sent successfully!' });
  } else {
    res.status(500).json({ error: 'Failed to send test email.' });
  }
});

module.exports = router;

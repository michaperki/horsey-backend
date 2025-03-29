// backend/services/emailService.js
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const { ExternalServiceError } = require('../utils/errorTypes');
const logger = require('../utils/logger'); // Use structured logger
dotenv.config();

// Create a transporter using SMTP (e.g., Gmail)
const transporter = nodemailer.createTransport({
  service: 'Gmail', // You can use other services like Outlook, Yahoo, etc.
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS, // Your email password or App Password if using Gmail with 2FA
  },
});

// Verify the transporter configuration only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  transporter.verify((error, success) => {
    if (error) {
      logger.error('Email transporter configuration error', { error: error.message, stack: error.stack });
    } else {
      logger.info('Email transporter is ready to send messages');
    }
  });
}

/**
 * Sends an email.
 * @param {string} to - Recipient's email address.
 * @param {string} subject - Subject of the email.
 * @param {string} text - Plain text content of the email.
 * @param {string} html - (Optional) HTML content of the email.
 * @returns {Promise} - Resolves if email is sent successfully, rejects otherwise.
 */
const sendEmail = async (to, subject, text, html = null) => {
  // Validate input parameters
  if (!to || !subject || !text) {
    throw new Error('Email recipient, subject, and text are required');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    ...(html && { html }),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    if (process.env.NODE_ENV !== 'test') {
      logger.info(`Email sent to ${to}`, { response: info.response });
    }
    return { success: true, info };
  } catch (error) {
    logger.error(`Error sending email to ${to}`, { error: error.message, stack: error.stack });
    throw new ExternalServiceError('Email Service', `Failed to send email: ${error.message}`);
  }
};

/**
 * Sends a welcome email to a new user
 * @param {Object} user - User object with email and username
 * @returns {Promise} - Result of email sending operation
 */
const sendWelcomeEmail = async (user) => {
  const subject = 'Welcome to Chess Betting Platform!';
  const text = `
Hello ${user.username},

Welcome to the Chess Betting Platform! We're excited to have you join our community.

Here are a few things you can do to get started:
1. Connect your Lichess account in your profile
2. Explore available bets
3. Place your first bet

If you have any questions, feel free to reach out to our support team.

Happy betting!
The Chess Betting Team
  `;

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #2a4b8d;">Welcome to Chess Betting Platform!</h1>
  <p>Hello <strong>${user.username}</strong>,</p>
  <p>Welcome to the Chess Betting Platform! We're excited to have you join our community.</p>
  <h3>Here are a few things you can do to get started:</h3>
  <ol>
    <li>Connect your Lichess account in your profile</li>
    <li>Explore available bets</li>
    <li>Place your first bet</li>
  </ol>
  <p>If you have any questions, feel free to reach out to our support team.</p>
  <p>Happy betting!<br/>The Chess Betting Team</p>
</div>
  `;

  return await sendEmail(user.email, subject, text, html);
};

/**
 * Sends a notification email about a bet result
 * @param {Object} params - Parameters for the bet result email
 * @returns {Promise} - Result of email sending operation
 */
const sendBetResultEmail = async ({ user, bet, outcome, winnings }) => {
  let subject, text, html;
  
  if (outcome === 'win') {
    subject = 'Congratulations! You Won Your Bet';
    text = `
Hello ${user.username},

Great news! You've won your bet on the game #${bet.gameId}.
You've won ${winnings} ${bet.currencyType}s.

Your winnings have been added to your account balance.

Happy betting!
The Chess Betting Team
    `;
    
    html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #2a8d2a;">Congratulations! You Won Your Bet</h1>
  <p>Hello <strong>${user.username}</strong>,</p>
  <p>Great news! You've won your bet on the game <strong>#${bet.gameId}</strong>.</p>
  <p style="font-size: 18px; color: #2a8d2a; font-weight: bold;">You've won ${winnings} ${bet.currencyType}s.</p>
  <p>Your winnings have been added to your account balance.</p>
  <p>Happy betting!<br/>The Chess Betting Team</p>
</div>
    `;
  } else if (outcome === 'loss') {
    subject = 'Bet Result Notification';
    text = `
Hello ${user.username},

We're sorry to inform you that you've lost your bet on the game #${bet.gameId}.

Don't worry, there are always more opportunities to win! Check out the available bets and try again.

Happy betting!
The Chess Betting Team
    `;
    
    html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #8d2a2a;">Bet Result Notification</h1>
  <p>Hello <strong>${user.username}</strong>,</p>
  <p>We're sorry to inform you that you've lost your bet on the game <strong>#${bet.gameId}</strong>.</p>
  <p>Don't worry, there are always more opportunities to win! Check out the available bets and try again.</p>
  <p>Happy betting!<br/>The Chess Betting Team</p>
</div>
    `;
  } else { // draw
    subject = 'Bet Result: Draw';
    text = `
Hello ${user.username},

The game #${bet.gameId} has ended in a draw.
Your initial bet of ${bet.amount} ${bet.currencyType}s has been refunded to your account.

Happy betting!
The Chess Betting Team
    `;
    
    html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #8d8d2a;">Bet Result: Draw</h1>
  <p>Hello <strong>${user.username}</strong>,</p>
  <p>The game <strong>#${bet.gameId}</strong> has ended in a draw.</p>
  <p>Your initial bet of ${bet.amount} ${bet.currencyType}s has been refunded to your account.</p>
  <p>Happy betting!<br/>The Chess Betting Team</p>
</div>
    `;
  }
  
  return await sendEmail(user.email, subject, text, html);
};

module.exports = { sendEmail, sendWelcomeEmail, sendBetResultEmail };


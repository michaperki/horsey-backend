
// backend/services/emailService.js
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

// Create a transporter using SMTP (e.g., Gmail)
const transporter = nodemailer.createTransport({
  service: 'Gmail', // You can use other services like Outlook, Yahoo, etc.
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS, // Your email password or App Password if using Gmail with 2FA
  },
});

// Function to log messages based on environment
const log = (message) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(message);
  }
};

// Verify the transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Email transporter configuration error:', error);
  } else {
    log('Email transporter is ready to send messages');
  }
});

/**
 * Sends an email.
 * @param {string} to - Recipient's email address.
 * @param {string} subject - Subject of the email.
 * @param {string} text - Plain text content of the email.
 * @param {string} html - (Optional) HTML content of the email.
 * @returns {Promise} - Resolves if email is sent successfully, rejects otherwise.
 */
const sendEmail = async (to, subject, text, html = null) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    ...(html && { html }),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    log(`Email sent to ${to}: ${info.response}`);
    return { success: true, info };
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
    return { success: false, error };
  }
};

module.exports = { sendEmail };


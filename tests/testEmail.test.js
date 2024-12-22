// backend/tests/testEmail.test.js
const request = require('supertest');
const app = require('../server');
const emailService = require('../services/emailService');

// Mock the sendEmail and transporter
jest.mock('../services/emailService');

describe('Test Email Route', () => {
  beforeEach(() => {
    emailService.sendEmail.mockClear();
    if (emailService.transporter && emailService.transporter.close) {
      emailService.transporter.close.mockClear(); // Clear the close mock
    }
  });

  afterAll(() => {
    if (emailService.transporter && emailService.transporter.close) {
      emailService.transporter.close(); // Ensure transporter is closed after tests
    }
  });

  it('should send a test email successfully', async () => {
    emailService.sendEmail.mockResolvedValue({ success: true });

    const res = await request(app).get('/email/send-test-email');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message', 'Test email sent successfully!');
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'recipient@example.com',
      'Test Email',
      'This is a test email sent from the Chess Betting platform.'
    );
  });

  it('should handle email sending failure gracefully', async () => {
    emailService.sendEmail.mockResolvedValue({ success: false, error: 'SMTP error' });

    const res = await request(app).get('/email/send-test-email');

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('error', 'Failed to send test email.');
    expect(emailService.sendEmail).toHaveBeenCalled();
  });

  it('should handle unexpected errors', async () => {
    emailService.sendEmail.mockRejectedValue(new Error('Unexpected error'));

    const res = await request(app).get('/email/send-test-email');

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('error', 'Failed to send test email.');
    expect(emailService.sendEmail).toHaveBeenCalled();
  });
});

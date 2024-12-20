// backend/tests/__mocks__/emailService.js
module.exports = {
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
};

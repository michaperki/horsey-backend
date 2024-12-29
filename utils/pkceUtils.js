
const crypto = require('crypto');

function generateCodeVerifier() {
  const codeVerifier = crypto.randomBytes(32).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return codeVerifier;
}

function generateCodeChallenge(codeVerifier) {
  return crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

module.exports = { generateCodeVerifier, generateCodeChallenge };

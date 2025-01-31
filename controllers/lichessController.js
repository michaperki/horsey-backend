
// backend/controllers/lichessController.js

const axios = require('axios');
const qs = require('querystring');
const crypto = require('crypto');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');
const { getGameOutcome } = require('../services/lichessService');
const { calculateRatingClassAndKarma } = require('../services/ratingService');
const Bet = require('../models/Bet');

// In-memory store for OAuth data. For production, use a persistent store like Redis.
const oauthStore = new Map();

/**
 * Generates a random state parameter for OAuth CSRF protection.
 */
const generateRandomState = () => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Generates a code_verifier for PKCE.
 */
const generateCodeVerifier = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Generates a code_challenge from the code_verifier using SHA-256.
 */
const generateCodeChallenge = (codeVerifier) => {
  return crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url'); // base64url encoding
};

/**
 * Initiates the Lichess OAuth flow by redirecting the user to Lichess's authorization page with PKCE.
 */
const initiateLichessOAuth = (req, res) => {
  const { LICHESS_CLIENT_ID, LICHESS_REDIRECT_URI, LICHESS_SCOPES } = process.env;

  // Log the client ID and redirect URI
  console.log('LICHESS_CLIENT_ID:', LICHESS_CLIENT_ID);
  console.log('LICHESS_REDIRECT_URI:', LICHESS_REDIRECT_URI);

  if (!LICHESS_CLIENT_ID || !LICHESS_REDIRECT_URI) {
    console.error('Lichess OAuth configuration is missing.');
    return res.status(500).json({ error: 'Lichess OAuth configuration is missing.' });
  }

  const state = generateRandomState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  oauthStore.set(state, {
    userId: req.user.id,
    codeVerifier,
    createdAt: Date.now(),
  });

  const scope = LICHESS_SCOPES || 'challenge:read challenge:write';
  const authorizationUrl = `https://lichess.org/oauth/authorize?${qs.stringify({
    response_type: 'code',
    client_id: LICHESS_CLIENT_ID,
    redirect_uri: LICHESS_REDIRECT_URI,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })}`;

  // Send the authorization URL as JSON
  res.status(200).json({ redirectUrl: authorizationUrl });
};

/**
 * Maps Lichess perfs to the application's lichessRatings schema.
 */
const mapPerfsToRatings = (perfs) => {
  const ratings = {
    standard: {},
    variants: {}
  };

  // Define standard time controls
  const standardTimeControls = [
    'ultraBullet',
    'bullet',
    'blitz',
    'rapid',
    'classical',
    'correspondence'
  ];

  // Define recognized variants
  const recognizedVariants = [
    'chess960',
    'kingOfTheHill',
    'threeCheck',
    'antichess',
    'atomic',
    'horde',
    'racingKings',
    'crazyhouse',
    // Add other variants as needed
  ];

  // Iterate over each perf in perfs
  for (const [key, value] of Object.entries(perfs)) {
    if (!value || typeof value.rating !== 'number') {
      // Skip entries without a valid rating
      continue;
    }

    if (standardTimeControls.includes(key)) {
      // Handle standard time controls
      ratings.standard[key] = value.rating;
    } else if (recognizedVariants.includes(key)) {
      // Handle variants with overall ratings
      ratings.variants[key] = value.rating;
    } else {
      // Handle unexpected variants or formats
      console.warn(`Unexpected perf key: ${key}. Skipping.`);
      continue; // Skip unexpected entries
    }
  }

  return ratings;
};

/**
 * Handles the OAuth callback from Lichess, exchanges the code for tokens, and stores user data.
 */
const handleLichessCallback = async (req, res) => {
  console.log(req.query);
  const { code, state } = req.query;

  console.log('Received OAuth callback with code:', code, 'and state:', state);

  if (!code || !state) {
    console.error('Missing code or state parameter.');
    return res.redirect(`${process.env.FRONTEND_URL}/home?lichess=error&message=${encodeURIComponent('Missing code or state parameter')}`);
  }

  const oauthData = oauthStore.get(state);

  if (!oauthData) {
    console.error('Invalid or expired state parameter.');
    return res.redirect(`${process.env.FRONTEND_URL}/home?lichess=error&message=${encodeURIComponent('Invalid or expired state parameter')}`);
  }

  const { userId, codeVerifier, createdAt } = oauthData;

  const STATE_EXPIRATION_TIME = 10 * 60 * 1000; // 10 minutes
  if (Date.now() - createdAt > STATE_EXPIRATION_TIME) {
    oauthStore.delete(state);
    console.error('State parameter has expired.');
    return res.redirect(`${process.env.FRONTEND_URL}/home?lichess=error&message=${encodeURIComponent('State parameter has expired')}`);
  }

  try {
    const { LICHESS_CLIENT_ID, LICHESS_CLIENT_SECRET, LICHESS_REDIRECT_URI } = process.env;

    if (!LICHESS_CLIENT_SECRET) {
      throw new Error('Lichess client secret is not configured.');
    }

    // Exchange authorization code for tokens
    const tokenResponse = await axios.post(
      'https://lichess.org/api/token',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: LICHESS_REDIRECT_URI,
        client_id: LICHESS_CLIENT_ID,
        client_secret: LICHESS_CLIENT_SECRET,
        code_verifier: codeVerifier,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Fetch user profile from Lichess
    const profileResponse = await axios.get('https://lichess.org/api/account', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const { id, username, perfs } = profileResponse.data;

    // Log the entire perfs object for debugging
    console.log(`Fetched perfs for user ${username}:`, JSON.stringify(perfs, null, 2));

    const extractedRatings = mapPerfsToRatings(perfs);

    // Log the extracted ratings for verification
    console.log(`Extracted Ratings for user ${username}:`, JSON.stringify(extractedRatings, null, 2));
    const { ratingClass, karma } = calculateRatingClassAndKarma(perfs);

    // Update the user's Lichess information in the database
    await User.findByIdAndUpdate(userId, {
      lichessId: id,
      lichessUsername: username,
      lichessAccessToken: access_token,
      lichessRefreshToken: refresh_token,
      lichessConnectedAt: new Date(), // Set the connection timestamp
      lichessRatings: extractedRatings, // Assign mapped ratings
      ratingClass,  // from service
      karma,        // from service
    });

    // Clear the OAuth data from the store
    oauthStore.delete(state);

    console.log(`User ${userId} connected Lichess account: ${username}`);

    // Redirect back to frontend with success query parameter
    res.redirect(`${process.env.FRONTEND_URL}/profile?lichess=connected`);
  } catch (error) {
    // Clear the OAuth data from the store in case of error
    oauthStore.delete(state);

    console.error('Error during Lichess OAuth callback:', error.response?.data || error.message);
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?lichess=error&message=${encodeURIComponent('Failed to complete Lichess OAuth')}`);
  }
};

/**
 * Fetches the Lichess connection status of the authenticated user.
 */
const getLichessStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    // Explicitly select lichessAccessToken
    const user = await User.findById(userId).select('+lichessAccessToken');

    if (!user) {
      return res.status(200).json({
        username: null,
        ratings: {},
        connectedAt: null, 
        connected: false
      });
    }

    const isConnected = !!user.lichessId && !!user.lichessAccessToken;

    res.status(200).json({
      connected: isConnected,
      lichessId: user.lichessId || null,
      lichessUsername: user.lichessUsername || null,
    });
  } catch (error) {
    console.error('Error fetching Lichess status:', error.message);
    res.status(500).json({ error: 'Failed to fetch Lichess status' });
  }
};

/**
 * Fetches the connected Lichess user information with enhanced error handling.
 */
const getLichessUser = async (req, res) => {
  try {
    const userId = req.user.id; // Get the authenticated user's ID
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.lichessId) {
      return res.status(404).json({ error: 'Lichess account not connected' });
    }

    // Ensure ratings object exists and handle missing ratings gracefully
    const lichessRatings = user.lichessRatings || {};

    // Prepare standard ratings
    const standardRatings = lichessRatings.standard || {};

    // Prepare variant ratings
    const variantRatings = lichessRatings.variants || {};

    res.status(200).json({
      username: user.lichessUsername || 'N/A',
      ratings: {
        standard: {
          ultraBullet: standardRatings.ultraBullet || 'N/A',
          bullet: standardRatings.bullet || 'N/A',
          blitz: standardRatings.blitz || 'N/A',
          rapid: standardRatings.rapid || 'N/A',
          classical: standardRatings.classical || 'N/A',
          correspondence: standardRatings.correspondence || 'N/A',
        },
        variants: {
          chess960: variantRatings.chess960 || 'N/A',
          kingOfTheHill: variantRatings.kingOfTheHill || 'N/A',
          threeCheck: variantRatings.threeCheck || 'N/A',
          antichess: variantRatings.antichess || 'N/A',
          atomic: variantRatings.atomic || 'N/A',
          horde: variantRatings.horde || 'N/A',
          racingKings: variantRatings.racingKings || 'N/A',
          crazyhouse: variantRatings.crazyhouse || 'N/A',
          // Add other variants as needed
        },
      }, // Include all ratings with variants
      connectedAt: user.lichessConnectedAt || null, // Provide connection timestamp if available
    });
  } catch (error) {
    console.error('Error fetching Lichess user information:', error.message);
    res.status(500).json({ error: 'Failed to fetch Lichess user information' });
  }
};

/**
 * Handles disconnecting the user's Lichess account.
 */
const disconnectLichessAccountHandler = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.lichessId) {
      return res.status(400).json({ error: 'Lichess account is not connected' });
    }

    // Clear Lichess-related fields
    user.lichessId = null;
    user.lichessUsername = null;
    user.lichessAccessToken = null;
    user.lichessRefreshToken = null;
    user.lichessConnectedAt = null;
    user.lichessRatings = {
      standard: {},
      variants: {}
    };

    await user.save();

    console.log(`User ${userId} disconnected their Lichess account.`);

    res.status(200).json({ message: 'Lichess account disconnected successfully.' });
  } catch (error) {
    console.error('Error disconnecting Lichess account:', error.message);
    res.status(500).json({ error: 'Failed to disconnect Lichess account.' });
  }
};


module.exports = {
  // Removed validateResultHandler as tokenService is deprecated
  initiateLichessOAuth,
  handleLichessCallback,
  getLichessStatus,
  getLichessUser,
  disconnectLichessAccountHandler
};


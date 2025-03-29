// backend/controllers/lichessController.js

const axios = require('axios');
const qs = require('querystring');
const crypto = require('crypto');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');
const { getGameOutcome } = require('../services/lichessService');
const { calculateRatingClassAndKarma } = require('../services/ratingService');
const Bet = require('../models/Bet');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { 
  ValidationError, 
  ResourceNotFoundError, 
  ExternalServiceError,
  AuthenticationError
} = require('../utils/errorTypes');
const logger = require('../utils/logger');

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
const initiateLichessOAuth = asyncHandler(async (req, res) => {
  const { LICHESS_CLIENT_ID, LICHESS_REDIRECT_URI, LICHESS_SCOPES } = process.env;

  logger.info('Initiating Lichess OAuth', {
    LICHESS_CLIENT_ID,
    LICHESS_REDIRECT_URI
  });

  if (!LICHESS_CLIENT_ID || !LICHESS_REDIRECT_URI) {
    throw new ValidationError('Lichess OAuth configuration is missing.');
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

  logger.info('OAuth authorization URL generated', { state, authorizationUrl });
  res.status(200).json({ redirectUrl: authorizationUrl });
});

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
      continue;
    }

    if (standardTimeControls.includes(key)) {
      ratings.standard[key] = value.rating;
    } else if (recognizedVariants.includes(key)) {
      ratings.variants[key] = value.rating;
    } else {
      logger.warn('Unexpected perf key encountered', { key });
      continue;
    }
  }

  return ratings;
};

/**
 * Handles the OAuth callback from Lichess, exchanges the code for tokens, and stores user data.
 */
const handleLichessCallback = asyncHandler(async (req, res) => {
  logger.info('Received Lichess OAuth callback', { query: req.query });
  const { code, state } = req.query;

  if (!code || !state) {
    throw new ValidationError('Missing code or state parameter.');
  }

  const oauthData = oauthStore.get(state);

  if (!oauthData) {
    throw new AuthenticationError('Invalid or expired state parameter.');
  }

  const { userId, codeVerifier, createdAt } = oauthData;
  const STATE_EXPIRATION_TIME = 10 * 60 * 1000; // 10 minutes

  if (Date.now() - createdAt > STATE_EXPIRATION_TIME) {
    oauthStore.delete(state);
    throw new AuthenticationError('State parameter has expired.');
  }

  const { LICHESS_CLIENT_ID, LICHESS_CLIENT_SECRET, LICHESS_REDIRECT_URI } = process.env;

  if (!LICHESS_CLIENT_SECRET) {
    throw new ValidationError('Lichess client secret is not configured.');
  }

  try {
    logger.info('Exchanging code for tokens', { userId, state });
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
    logger.info('Token exchange successful', { userId, expires_in });

    const profileResponse = await axios.get('https://lichess.org/api/account', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const { id, username, perfs } = profileResponse.data;
    logger.info('Fetched Lichess account data', { lichessUsername: username });

    logger.debug('Lichess perfs received', { perfs });
    const extractedRatings = mapPerfsToRatings(perfs);
    logger.debug('Extracted ratings', { lichessUsername: username, extractedRatings });

    const { ratingClass, karma } = calculateRatingClassAndKarma(perfs);

    await User.findByIdAndUpdate(userId, {
      lichessId: id,
      lichessUsername: username,
      lichessAccessToken: access_token,
      lichessRefreshToken: refresh_token,
      lichessConnectedAt: new Date(),
      lichessRatings: extractedRatings,
      ratingClass,
      karma,
    });

    oauthStore.delete(state);
    logger.info('Lichess account connected', { userId, lichessUsername: username });

    res.redirect(`${process.env.FRONTEND_URL}/profile?lichess=connected`);
  } catch (error) {
    oauthStore.delete(state);
    logger.error('Error during Lichess OAuth callback', { error: error.response?.data || error.message });
    throw new ExternalServiceError('Lichess', 'Failed to complete Lichess OAuth: ' + (error.response?.data || error.message));
  }
});

/**
 * Fetches the Lichess connection status of the authenticated user.
 */
const getLichessStatus = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select('+lichessAccessToken');

  if (!user) {
    logger.warn('User not found when fetching Lichess status', { userId });
    return res.status(200).json({
      username: null,
      ratings: {},
      connectedAt: null, 
      connected: false
    });
  }

  const isConnected = !!user.lichessId && !!user.lichessAccessToken;
  logger.info('Lichess status fetched', { userId, connected: isConnected });

  res.status(200).json({
    connected: isConnected,
    lichessId: user.lichessId || null,
    lichessUsername: user.lichessUsername || null,
  });
});

/**
 * Fetches the connected Lichess user information with enhanced error handling.
 */
const getLichessUser = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId);

  if (!user) {
    logger.warn('User not found when fetching Lichess user info', { userId });
    throw new ResourceNotFoundError('User');
  }

  if (!user.lichessId) {
    logger.warn('Lichess account not connected', { userId });
    throw new ResourceNotFoundError('Lichess account not connected');
  }

  const lichessRatings = user.lichessRatings || {};
  const standardRatings = lichessRatings.standard || {};
  const variantRatings = lichessRatings.variants || {};

  logger.info('Returning Lichess user info', { userId, lichessUsername: user.lichessUsername });

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
      },
    },
    connectedAt: user.lichessConnectedAt || null,
  });
});

/**
 * Handles disconnecting the user's Lichess account.
 */
const disconnectLichessAccountHandler = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId);

  if (!user) {
    logger.warn('User not found when disconnecting Lichess account', { userId });
    throw new ResourceNotFoundError('User');
  }

  if (!user.lichessId) {
    logger.warn('Lichess account already disconnected', { userId });
    throw new ValidationError('Lichess account is not connected');
  }

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
  logger.info('User disconnected their Lichess account', { userId });

  res.status(200).json({ message: 'Lichess account disconnected successfully.' });
});

module.exports = {
  initiateLichessOAuth,
  handleLichessCallback,
  getLichessStatus,
  getLichessUser,
  disconnectLichessAccountHandler
};


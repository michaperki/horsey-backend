// backend/controllers/lichessController.js

const axios = require('axios');
const qs = require('querystring');
const crypto = require('crypto');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');
const { getGameOutcome } = require('../services/lichessService');
const Bet = require('../models/Bet');
const tokenService = require('../services/tokenService');

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

  // Logging for debugging (remove or limit in production)
  console.log('Initiating Lichess OAuth for User ID:', req.user.id);

  if (!LICHESS_CLIENT_ID || !LICHESS_REDIRECT_URI) {
    console.error('Lichess OAuth configuration is missing.');
    return res.status(500).json({ error: 'Lichess OAuth configuration is missing.' });
  }

  // Generate a random state parameter for CSRF protection
  const state = generateRandomState();

  // Generate code_verifier and code_challenge for PKCE
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Store state and codeVerifier associated with the userId
  oauthStore.set(state, {
    userId: req.user.id,
    codeVerifier,
    createdAt: Date.now(),
  });

  // Define the scope; adjust as necessary
  const scope = LICHESS_SCOPES || 'challenge:write';

  // Construct the authorization URL
  const authorizationUrl = `https://lichess.org/oauth/authorize?${qs.stringify({
    response_type: 'code',
    client_id: LICHESS_CLIENT_ID,
    redirect_uri: LICHESS_REDIRECT_URI,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })}`;

  // Logging for debugging (avoid logging sensitive information)
  console.log('Generated state:', state);
  console.log('Authorization URL:', authorizationUrl);

  // Redirect the user to Lichess OAuth authorization page
  res.redirect(authorizationUrl);
};

/**
 * Handles the OAuth callback from Lichess, exchanges the code for tokens, and stores user data.
 */
const handleLichessCallback = async (req, res) => {
  const { code, state } = req.query;

  // Logging for debugging
  console.log('Received OAuth callback with code:', code, 'and state:', state);

  // Check for missing parameters
  if (!code || !state) {
    console.error('Missing code or state parameter.');
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?lichess=error&message=${encodeURIComponent('Missing code or state parameter')}`);
  }

  // Retrieve OAuth data from the store using the state parameter
  const oauthData = oauthStore.get(state);

  if (!oauthData) {
    console.error('Invalid or expired state parameter.');
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?lichess=error&message=${encodeURIComponent('Invalid or expired state parameter')}`);
  }

  const { userId, codeVerifier, createdAt } = oauthData;

  // Optional: Implement state expiration (e.g., 10 minutes)
  const STATE_EXPIRATION_TIME = 10 * 60 * 1000; // 10 minutes in milliseconds
  if (Date.now() - createdAt > STATE_EXPIRATION_TIME) {
    oauthStore.delete(state);
    console.error('State parameter has expired.');
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?lichess=error&message=${encodeURIComponent('State parameter has expired')}`);
  }

  try {
    const { LICHESS_CLIENT_ID, LICHESS_CLIENT_SECRET, LICHESS_REDIRECT_URI } = process.env;

    if (!LICHESS_CLIENT_SECRET) {
      throw new Error('Lichess client secret is not configured.');
    }

    // Exchange authorization code for access token
    const tokenResponse = await axios.post(
      'https://lichess.org/api/token',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: LICHESS_REDIRECT_URI,
        client_id: LICHESS_CLIENT_ID,
        client_secret: LICHESS_CLIENT_SECRET, // Include client_secret as required
        code_verifier: codeVerifier, // Include the code_verifier for PKCE
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

    // Extract ratings from perfs
    const extractedRatings = {
      bullet: perfs.bullet ? perfs.bullet.rating : null,
      blitz: perfs.blitz ? perfs.blitz.rating : null,
      rapid: perfs.rapid ? perfs.rapid.rating : null,
      classical: perfs.classical ? perfs.classical.rating : null,
      // Add other rating types as needed
    };

    // Update the user's Lichess information in the database
    await User.findByIdAndUpdate(userId, {
      lichessId: id,
      lichessUsername: username,
      lichessAccessToken: access_token,
      lichessRefreshToken: refresh_token,
      lichessConnectedAt: new Date(), // Set the connection timestamp
      lichessRatings: extractedRatings, // Assign only numeric ratings
    });

    // Clear the OAuth data from the store
    oauthStore.delete(state);

    // Logging for debugging
    console.log(`User ${userId} connected Lichess account: ${username}`);

    // Redirect back to frontend with success query parameter
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?lichess=connected`);
  } catch (error) {
    // Clear the OAuth data from the store in case of error
    oauthStore.delete(state);

    console.error('Error during Lichess OAuth callback:', error.response?.data || error.message);
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?lichess=error&message=${encodeURIComponent('Failed to complete Lichess OAuth')}`);
  }
};

/**
 * Validates the result of a game and updates related bets.
 */
const validateResultHandler = async (req, res) => {
  const { gameId } = req.body;
  if (!gameId) {
    return res.status(400).json({ error: 'gameId is required' });
  }

  try {
    const gameResult = await getGameOutcome(gameId);
    if (!gameResult.success) {
      return res.status(500).json({ error: gameResult.error });
    }

    const { outcome } = gameResult;
    const bets = await Bet.find({ gameId, status: 'matched' })
      .populate('finalWhiteId', 'email username')
      .populate('finalBlackId', 'email username');

    if (!bets.length) {
      return res.status(404).json({ error: 'No matched bets found for this game' });
    }

    for (const bet of bets) {
      let winnerId, winnerEmail, winnerUsername;
      if (outcome === 'white') {
        winnerId = bet.finalWhiteId._id;
        winnerEmail = bet.finalWhiteId.email;
        winnerUsername = bet.finalWhiteId.username;
      } else if (outcome === 'black') {
        winnerId = bet.finalBlackId._id;
        winnerEmail = bet.finalBlackId.email;
        winnerUsername = bet.finalBlackId.username;
      } else {
        continue;
      }

      bet.status = 'won';
      await bet.save();

      const mintResult = await tokenService.mintTokens(winnerId, bet.amount);
      if (mintResult.success) {
        await sendEmail(
          winnerEmail,
          'Bet Won!',
          `Congratulations ${winnerUsername}! You won ${bet.amount} PTK on game ${gameId}.`
        );
      } else {
        console.error(`Failed to mint tokens for user ${winnerId}: ${mintResult.error}`);
      }
    }

    return res.status(200).json({ message: `Processed bets for game ${gameId}`, outcome });
  } catch (error) {
    console.error(`Error fetching game outcome for Game ID ${gameId}:`, error.message);
    const errorMessage = error.response?.data || 'Game not found';
    return res.status(500).json({ error: errorMessage });
  }
};

/**
 * Fetches the Lichess connection status of the authenticated user.
 */
const getLichessStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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
 * Fetches the connected Lichess user information.
 */
const getLichessUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.lichessId) {
      return res.status(404).json({ error: 'Lichess account not connected' });
    }

    // Extract the standard rating if available
    const standardRating = user.lichessRatings?.standard?.rating || 'N/A';

    res.status(200).json({
      username: user.lichessUsername, // Renamed to 'username'
      rating: standardRating,          // Extracted and renamed to 'rating'
      connectedAt: user.lichessConnectedAt || null, // Renamed to 'connectedAt'
    });
  } catch (error) {
    console.error('Error fetching Lichess user:', error.message);
    res.status(500).json({ error: 'Failed to fetch Lichess user' });
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
    user.lichessRatings = {};

    await user.save();

    console.log(`User ${userId} disconnected their Lichess account.`);

    res.status(200).json({ message: 'Lichess account disconnected successfully.' });
  } catch (error) {
    console.error('Error disconnecting Lichess account:', error.message);
    res.status(500).json({ error: 'Failed to disconnect Lichess account.' });
  }
};


module.exports = {
  validateResultHandler,
  initiateLichessOAuth,
  handleLichessCallback,
  getLichessStatus,
  getLichessUser,
  disconnectLichessAccountHandler
};

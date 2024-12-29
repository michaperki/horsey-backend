// backend/controllers/lichessController.js

const axios = require('axios');
const { getGameOutcome } = require('../services/lichessService');
const Bet = require('../models/Bet');
const User = require('../models/User');
const tokenService = require('../services/tokenService');
const { sendEmail } = require('../services/emailService');
const qs = require('querystring');
const crypto = require('crypto');

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
 * Generates a random state for OAuth security.
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

  // Logging for debugging (remove sensitive logs in production)
  console.log('LICHESS_CLIENT_ID:', LICHESS_CLIENT_ID);
  console.log('LICHESS_REDIRECT_URI:', LICHESS_REDIRECT_URI);
  console.log('LICHESS_SCOPES:', LICHESS_SCOPES);

  if (!LICHESS_CLIENT_ID || !LICHESS_REDIRECT_URI) {
    return res.status(500).json({ error: 'Lichess OAuth configuration is missing.' });
  }

  // Generate a random state parameter for CSRF protection
  const state = generateRandomState();
  req.session.lichessOAuthState = state;
  req.session.userId = req.user.id;

  // Generate code_verifier and code_challenge for PKCE
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  req.session.lichessOAuthCodeVerifier = codeVerifier;

  // Update the scope: remove 'read_profile' and include 'challenge:write'
  const scope = LICHESS_SCOPES || 'challenge:write';

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

  res.redirect(authorizationUrl); // Redirect to Lichess
};

/**
 * Handles the OAuth callback from Lichess, exchanges the code for tokens, and stores user data.
 */
const handleLichessCallback = async (req, res) => {
  console.log(req.query);
  const { code, state } = req.query;

  // Logging for debugging
  console.log('Received code:', code);
  console.log('Received state:', state);
  console.log('Stored state in session:', req.session.lichessOAuthState);
  console.log('Stored userId in session:', req.session.userId);
  console.log('Stored code_verifier in session:', req.session.lichessOAuthCodeVerifier);

  // Check for missing parameters
  if (!code || !state) {
    console.error('Missing code or state parameter.');
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?lichess=error&message=${encodeURIComponent('Missing code or state parameter')}`);
  }

  // Verify the state parameter for CSRF protection
  if (state !== req.session.lichessOAuthState) {
    console.error('State mismatch:', { received: state, expected: req.session.lichessOAuthState });
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?lichess=error&message=${encodeURIComponent('Invalid state parameter')}`);
  }

  // Retrieve code_verifier from session
  const codeVerifier = req.session.lichessOAuthCodeVerifier;
  if (!codeVerifier) {
    console.error('Missing code_verifier in session.');
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?lichess=error&message=${encodeURIComponent('Missing code_verifier')}`);
  }

  try {
    const { LICHESS_CLIENT_ID, LICHESS_CLIENT_SECRET, LICHESS_REDIRECT_URI } = process.env;

    // Get the userId from the session
    const userId = req.session.userId;

    if (!userId) {
      throw new Error('User ID not found in session.');
    }

    // Exchange authorization code for access token
    const tokenResponse = await axios.post(
      'https://lichess.org/api/token',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: LICHESS_REDIRECT_URI,
        client_id: LICHESS_CLIENT_ID,
        client_secret: LICHESS_CLIENT_SECRET, // Include client_secret if required
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

    const { id, username } = profileResponse.data;

    // Save the user's Lichess information in your database
    await User.findByIdAndUpdate(userId, {
      lichessId: id,
      lichessUsername: username,
      lichessAccessToken: access_token,
      lichessRefreshToken: refresh_token,
    });

    // Clear session values
    delete req.session.lichessOAuthState;
    delete req.session.lichessOAuthCodeVerifier;
    delete req.session.userId;

    // Logging for debugging
    console.log(`User ${userId} connected Lichess account: ${username}`);

    // Redirect back to frontend with success query parameter
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?lichess=connected`);
  } catch (error) {
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

    res.status(200).json({
      lichessId: user.lichessId,
      lichessUsername: user.lichessUsername,
    });
  } catch (error) {
    console.error('Error fetching Lichess user:', error.message);
    res.status(500).json({ error: 'Failed to fetch Lichess user' });
  }
};

module.exports = {
  validateResultHandler,
  initiateLichessOAuth,
  handleLichessCallback,
  getLichessStatus,
  getLichessUser,
};

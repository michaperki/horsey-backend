// backend/controllers/betController.js - Updated with error handling

const mongoose = require('mongoose');
const Bet = require('../models/Bet');
const User = require('../models/User');
const { getGameOutcome, createLichessGame, getUsernameFromAccessToken } = require('../services/lichessService');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ResourceNotFoundError, ValidationError, AuthorizationError, ExternalServiceError } = require('../utils/errorTypes');
const logger = require('../utils/logger');

/**
 * Helper function to check if a given game is open for betting.
 */
const isGameOpenForBetting = async (gameId) => {
  const gameResult = await getGameOutcome(gameId);
  if (!gameResult.success) {
    logger.error('Error retrieving game outcome', { gameId, error: gameResult.error });
    throw new ExternalServiceError('Lichess', gameResult.error);
  }
  // Betting is open if the game status is 'created' or 'started'
  return ['created', 'started'].includes(gameResult.status);
};

/**
 * Retrieves the bet history for the authenticated user.
 * Supports pagination and sorting.
 */
const getBetHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  logger.info('Fetching bet history', { userId });

  const { 
    page = 1, 
    limit = 10, 
    sortBy = 'createdAt', 
    order = 'desc',
    status,
    fromDate,
    toDate,
    minWager,
    maxWager,
    color,
    timeControl,
  } = req.query;

  const filter = {
    $or: [{ creatorId: userId }, { opponentId: userId }],
  };

  if (status) {
    filter.status = status;
  }
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) {
      filter.createdAt.$gte = new Date(fromDate);
    }
    if (toDate) {
      filter.createdAt.$lte = new Date(toDate);
    }
  }
  if (minWager || maxWager) {
    filter.amount = {};
    if (minWager) {
      filter.amount.$gte = Number(minWager);
    }
    if (maxWager) {
      filter.amount.$lte = Number(maxWager);
    }
  }
  if (color) {
    filter.creatorColor = color;
  }
  if (timeControl) {
    filter.timeControl = timeControl;
  }

  const validSortFields = ['createdAt', 'amount', 'gameId', 'status'];
  if (!validSortFields.includes(sortBy)) {
    logger.warn('Invalid sort field', { sortBy, validSortFields });
    throw new ValidationError(`Invalid sort field. Valid fields are: ${validSortFields.join(', ')}`);
  }

  const sortOrder = order === 'asc' ? 1 : -1;

  const bets = await Bet.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip((page - 1) * limit)
    .limit(parseInt(limit, 10))
    .populate('creatorId', 'username')
    .populate('opponentId', 'username');

  const totalBets = await Bet.countDocuments(filter);
  const totalPages = Math.ceil(totalBets / limit);

  logger.info('Bet history fetched', { userId, totalBets });

  res.json({
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalBets,
    totalPages,
    bets,
  });
});

/**
 * Maps timeControl to ratingCategory based on predefined rules.
 */
const mapTimeControlToRatingCategory = (minutes) => {
  if (minutes <= 3) {
    return 'bullet';
  } else if (minutes <= 5) {
    return 'blitz';
  } else if (minutes <= 15) {
    return 'rapid';
  } else {
    return 'classical';
  }
};

/**
 * Retrieves available bet seekers.
 */
const getAvailableSeekers = asyncHandler(async (req, res) => {
  const { currencyType } = req.query; 
  logger.info('Fetching available seekers', { currencyType, userId: req.user.id });

  const currentUser = await User.findById(req.user.id).select('ratingClass');
  if (!currentUser) {
    logger.error('User not found for available seekers', { userId: req.user.id });
    throw new ResourceNotFoundError('User');
  }
  
  const filter = { status: 'pending', ratingClass: currentUser.ratingClass };
  if (currencyType) {
    filter.currencyType = currencyType;
  }

  const pendingBets = await Bet.find(filter)
    .populate('creatorId', 'username tokenBalance sweepstakesBalance lichessRatings lichessUsername');

  const seekers = pendingBets.map((bet) => {
    const { timeControl, variant, currencyType } = bet;
    const ratings = bet.creatorId.lichessRatings || {};

    const [minutesStr, incrementStr] = timeControl.split('|');
    const minutes = parseInt(minutesStr, 10);

    let relevantRating = null;
    if (!isNaN(minutes)) {
      const ratingCategory = mapTimeControlToRatingCategory(minutes);
      if (variant.toLowerCase() === 'standard') {
        relevantRating = ratings['standard']?.[ratingCategory] || null;
      } else {
        relevantRating = ratings[variant.toLowerCase()]?.overall || null;
      }
    }

    return {
      id: bet._id,
      creator: bet.creatorId.username,
      creatorLichessUsername: bet.creatorId.lichessUsername,
      tokenBalance: bet.creatorId.tokenBalance,
      sweepstakesBalance: bet.creatorId.sweepstakesBalance,
      rating: relevantRating,
      colorPreference: bet.creatorColor,
      timeControl: bet.timeControl,
      variant: bet.variant,
      currencyType,
      wager: bet.amount,
      players: 2,
      createdAt: bet.createdAt,
      creatorRatings: bet.creatorId.lichessRatings,
    };
  });

  logger.info('Available seekers fetched', { count: seekers.length });
  res.json({ seekers });
});

/**
 * Places a new bet with an expiration time (e.g., 30 minutes).
 */
const placeBet = asyncHandler(async (req, res) => {
  const { colorPreference, amount, timeControl, variant, currencyType } = req.body;
  const creatorId = req.user.id;

  logger.info('Placing new bet', { userId: creatorId, colorPreference, amount, timeControl, variant, currencyType });

  // Basic validations
  const validVariants = ['standard', 'crazyhouse', 'chess960'];
  const validCurrencyTypes = ['token', 'sweepstakes'];
  
  if (!['white', 'black', 'random'].includes(colorPreference)) {
    throw new ValidationError('colorPreference must be "white", "black", or "random"');
  }
  
  if (!validVariants.includes(variant)) {
    throw new ValidationError(`variant must be one of: ${validVariants.join(', ')}`);
  }
  
  if (!validCurrencyTypes.includes(currencyType)) {
    throw new ValidationError(`currencyType must be one of: ${validCurrencyTypes.join(', ')}`);
  }
  
  if (!amount || amount <= 0) {
    throw new ValidationError('amount must be a positive number');
  }
  
  if (!timeControl || !/^\d+\|\d+$/.test(timeControl)) {
    throw new ValidationError('timeControl must be in the format "minutes|increment"');
  }

  const user = await User.findById(creatorId);
  if (!user) {
    logger.error('User not found when placing bet', { userId: creatorId });
    throw new ResourceNotFoundError('User');
  }

  // Determine which balance to use based on currencyType
  let currentBalance;
  if (currencyType === 'sweepstakes') {
    currentBalance = user.sweepstakesBalance;
  } else {
    currentBalance = user.tokenBalance;
  }

  if (currentBalance < amount) {
    logger.warn('Insufficient balance when placing bet', { userId: creatorId, required: amount, available: currentBalance, currencyType });
    throw new ValidationError(`Insufficient ${currencyType} balance`);
  }

  // Deduct from the appropriate balance
  if (currencyType === 'sweepstakes') {
    user.sweepstakesBalance -= amount;
  } else {
    user.tokenBalance -= amount;
  }
  await user.save();

  const newBet = new Bet({
    creatorId,
    creatorColor: colorPreference,
    amount,
    currencyType,
    timeControl,
    ratingClass: user.ratingClass,
    variant,
    status: 'pending',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  await newBet.save();

  logger.betEvent('created', newBet._id, creatorId, {
    amount,
    currencyType,
    timeControl,
    variant,
    status: 'pending'
  });

  // Optional socket event
  const io = req.app.get('io');
  io.to(creatorId.toString()).emit('betCreated', {
    message: 'Your bet has been placed successfully!',
    bet: {
      id: newBet._id,
      creatorColor: newBet.creatorColor,
      amount: newBet.amount,
      currencyType: newBet.currencyType,
      timeControl: newBet.timeControl,
      variant: newBet.variant,
      createdAt: newBet.createdAt,
    },
  });

  return res.status(201).json({ message: 'Bet placed successfully', bet: newBet });
});

/**
 * Accepts a pending bet, assigns colors, deducts tokens, creates a Lichess game, and updates the bet.
 */
const acceptBet = asyncHandler(async (req, res) => {
  const { betId } = req.params;
  const opponentId = req.user.id;

  logger.info('Accepting bet', { betId, userId: opponentId });

  if (!mongoose.Types.ObjectId.isValid(betId)) {
    throw new ValidationError('Invalid bet ID');
  }

  const bet = await Bet.findOneAndUpdate(
    { _id: betId, status: 'pending', opponentId: null },
    { opponentId, status: 'matched' },
    { new: true }
  ).populate('creatorId');

  if (!bet) {
    logger.warn('Bet not available for acceptance', { betId, userId: opponentId });
    throw new ResourceNotFoundError('Bet is no longer available or does not exist');
  }

  if (opponentId.toString() === bet.creatorId._id.toString()) {
    logger.warn('User attempted to accept their own bet', { betId, userId: opponentId, creatorId: bet.creatorId._id.toString() });
    await Bet.findByIdAndUpdate(betId, { opponentId: null, status: 'pending' });
    throw new ValidationError('You cannot accept your own bet.');
  }

  const opponent = await User.findById(opponentId);
  if (!opponent) {
    await Bet.findByIdAndUpdate(betId, { opponentId: null, status: 'pending' });
    throw new ResourceNotFoundError('Opponent user');
  }

  let opponentCurrentBalance = bet.currencyType === 'sweepstakes' 
    ? opponent.sweepstakesBalance 
    : opponent.tokenBalance;

  if (opponentCurrentBalance < bet.amount) {
    logger.warn('Insufficient balance to accept bet', { betId, userId: opponentId, required: bet.amount, available: opponentCurrentBalance, currencyType: bet.currencyType });
    await Bet.findByIdAndUpdate(betId, { opponentId: null, status: 'pending' });
    throw new ValidationError(`Insufficient ${bet.currencyType} balance to accept this bet`);
  }

  if (bet.currencyType === 'sweepstakes') {
    opponent.sweepstakesBalance -= bet.amount;
  } else {
    opponent.tokenBalance -= bet.amount;
  }
  await opponent.save();

  let finalWhiteId, finalBlackId;
  if (bet.creatorColor === 'random') {
    if (Math.random() < 0.5) {
      finalWhiteId = bet.creatorId._id;
      finalBlackId = opponentId;
    } else {
      finalWhiteId = opponentId;
      finalBlackId = bet.creatorId._id;
    }
  } else {
    finalWhiteId = bet.creatorColor === 'white' ? bet.creatorId._id : opponentId;
    finalBlackId = bet.creatorColor === 'black' ? bet.creatorId._id : opponentId;
  }

  logger.debug('Color assignment for bet', { 
    betId, 
    creatorId: bet.creatorId._id.toString(),
    opponentId,
    finalWhiteId: finalWhiteId.toString(),
    finalBlackId: finalBlackId.toString(),
    creatorColor: bet.creatorColor
  });

  const [whiteUser, blackUser] = await Promise.all([
    User.findById(finalWhiteId).select('+lichessAccessToken username _id'),
    User.findById(finalBlackId).select('+lichessAccessToken username _id'),
  ]);

  if (!whiteUser.lichessAccessToken || !blackUser.lichessAccessToken) {
    logger.error('Missing Lichess OAuth tokens', {
      betId,
      whiteUserId: finalWhiteId.toString(),
      blackUserId: finalBlackId.toString(),
      whiteHasToken: !!whiteUser.lichessAccessToken,
      blackHasToken: !!blackUser.lichessAccessToken
    });
    
    if (bet.currencyType === 'sweepstakes') {
      opponent.sweepstakesBalance += bet.amount;
    } else {
      opponent.tokenBalance += bet.amount;
    }
    await opponent.save();
    bet.status = 'pending';
    bet.opponentId = null;
    await bet.save();
    throw new ValidationError('Both users must connect their Lichess accounts.');
  }

  try {
    logger.info('Creating Lichess game', { 
      betId,
      timeControl: bet.timeControl,
      variant: bet.variant,
      whiteUsername: whiteUser.username,
      blackUsername: blackUser.username
    });
    
    const lichessResponse = await createLichessGame(
      bet.timeControl,
      bet.variant,
      whiteUser.lichessAccessToken,
      blackUser.lichessAccessToken,
      getUsernameFromAccessToken
    );

    if (!lichessResponse.success) {
      logger.error('Failed to create Lichess game', { betId, error: lichessResponse.error });
      
      if (bet.currencyType === 'sweepstakes') {
        opponent.sweepstakesBalance += bet.amount;
      } else {
        opponent.tokenBalance += bet.amount;
      }
      await opponent.save();
      bet.status = 'pending';
      bet.opponentId = null;
      await bet.save();
      throw new ExternalServiceError('Lichess', lichessResponse.error);
    }

    bet.finalWhiteId = finalWhiteId;
    bet.finalBlackId = finalBlackId;
    bet.gameId = lichessResponse.gameId;
    bet.gameLink = lichessResponse.gameLink;
    bet.status = 'matched';
    await bet.save();

    logger.betEvent('accepted', bet._id, opponentId, {
      gameId: lichessResponse.gameId,
      gameLink: lichessResponse.gameLink,
      status: 'matched',
      creatorId: bet.creatorId._id.toString()
    });

    const io = req.app.get('io');
    io.to(bet.creatorId._id.toString()).emit('betAccepted', {
      message: 'Your bet has been accepted!',
      bet,
      gameLink: bet.gameLink,
    });

    io.to(opponentId.toString()).emit('betAccepted', {
      message: 'You have accepted a bet!',
      bet,
      gameLink: bet.gameLink,
    });

    return res.json({
      message: 'Bet matched successfully',
      bet,
      gameId: lichessResponse.gameId,
      gameLink: lichessResponse.gameLink,
    });
  } catch (error) {
    if (error.isOperational) {
      throw error;
    }
    logger.error('Error in acceptBet', { betId, errorMessage: error.message, stack: error.stack });
    throw new ExternalServiceError('Lichess', error.message);
  }
});

/**
 * Cancels a pending bet and restores the user's balance.
 */
const cancelBet = asyncHandler(async (req, res) => {
  const { betId } = req.params;
  const userId = req.user.id;

  logger.info('Canceling bet', { betId, userId });

  if (!mongoose.Types.ObjectId.isValid(betId)) {
    throw new ValidationError('Invalid bet ID');
  }

  const bet = await Bet.findOneAndUpdate(
    { _id: betId, creatorId: userId, status: 'pending' },
    { status: 'canceled' },
    { new: true }
  );

  if (!bet) {
    logger.warn('Bet not found or not cancelable', { betId, userId });
    throw new ResourceNotFoundError('Bet not found or not in pending status');
  }

  const user = await User.findById(userId);
  if (!user) {
    logger.error('User not found when canceling bet', { userId });
    throw new ResourceNotFoundError('User');
  }
  
  if (bet.currencyType === 'sweepstakes') {
    user.sweepstakesBalance += bet.amount;
  } else {
    user.tokenBalance += bet.amount;
  }
  await user.save();

  logger.info('Bet canceled successfully', { betId, userId });
  return res.json({ message: 'Bet canceled successfully', bet });
});

module.exports = { getBetHistory, getAvailableSeekers, placeBet, acceptBet, cancelBet };


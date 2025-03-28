// services/ratingService.js
const { ValidationError } = require('../utils/errorTypes');

/**
 * Calculates the highest standard rating and total games played.
 * Returns an object with the ratingClass and karma.
 * @param {Object} perfs - The performance data from Lichess API
 * @returns {Object} - Object containing ratingClass and karma values
 */
function calculateRatingClassAndKarma(perfs) {
  console.log('Starting rating calculation with input performance data:', perfs);

  // Validate input
  if (!perfs || typeof perfs !== 'object') {
    throw new ValidationError('Invalid performance data provided');
  }

  const standardControls = ['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence'];
  let highestRating = 0;
  let totalGames = 0;

  for (const control of standardControls) {
    const perf = perfs[control];
    if (perf && typeof perf.rating === 'number') {
      console.log(`Processing ${control}: rating=${perf.rating}, games=${perf.games || 0}`);
      highestRating = Math.max(highestRating, perf.rating);
      if (perf.games) {
        totalGames += perf.games;
      }
    }
  }

  console.log(`Highest rating found: ${highestRating}`);
  console.log(`Total games played: ${totalGames}`);

  let ratingClass = 'Beginner';
  if (highestRating < 1200) {
    ratingClass = 'Beginner';
  } else if (highestRating < 1600) {
    ratingClass = 'Intermediate';
  } else if (highestRating < 2000) {
    ratingClass = 'Advanced';
  } else {
    ratingClass = 'Expert';
  }

  console.log(`Assigned rating class: ${ratingClass}`);

  // Here we assign karma directly as total games (or adjust as needed)
  const karma = totalGames;

  console.log('Finished rating calculation:', { ratingClass, karma });

  return { ratingClass, karma };
}

/**
 * Estimates a player's rough skill level based on limited info
 * Useful when we don't have full Lichess stats
 * @param {Object} params - Parameters for estimation
 * @returns {Object} - Estimated rating class and value
 */
function estimateSkillLevel({ gamesPlayed, winRate, timeControl }) {
  // Basic validation
  if (typeof gamesPlayed !== 'number' || gamesPlayed < 0) {
    throw new ValidationError('Games played must be a non-negative number');
  }
  
  if (typeof winRate !== 'number' || winRate < 0 || winRate > 100) {
    throw new ValidationError('Win rate must be a number between 0 and 100');
  }
  
  const validTimeControls = ['bullet', 'blitz', 'rapid', 'classical'];
  if (!validTimeControls.includes(timeControl)) {
    throw new ValidationError(`Time control must be one of: ${validTimeControls.join(', ')}`);
  }
  
  // Experience factor (0-100)
  let experienceFactor = Math.min(100, gamesPlayed / 10);
  
  // Win rate factor (higher win rates indicate higher skill)
  const winRateFactor = winRate;
  
  // Time control factor (slower time controls generally show higher skill)
  const timeControlFactors = {
    bullet: 0.85,
    blitz: 1.0,
    rapid: 1.1,
    classical: 1.2
  };
  
  // Calculate estimated rating (base 1200 + factors)
  const baseRating = 1200;
  const estimatedRating = baseRating + 
                           (experienceFactor * 2) + 
                           ((winRateFactor - 50) * 15) * 
                           timeControlFactors[timeControl];
  
  // Determine rating class based on the same thresholds
  let ratingClass;
  if (estimatedRating < 1200) {
    ratingClass = 'Beginner';
  } else if (estimatedRating < 1600) {
    ratingClass = 'Intermediate';
  } else if (estimatedRating < 2000) {
    ratingClass = 'Advanced';
  } else {
    ratingClass = 'Expert';
  }
  
  return {
    ratingClass,
    estimatedRating: Math.round(estimatedRating),
    confidence: Math.min(100, (experienceFactor / 2) + 50) // Higher with more games
  };
}

module.exports = { calculateRatingClassAndKarma, estimateSkillLevel };

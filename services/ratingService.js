
// services/ratingService.js

/**
 * Calculates the highest standard rating and total games played.
 * Returns an object with the ratingClass and karma.
 */
function calculateRatingClassAndKarma(perfs) {
  console.log('Starting rating calculation with input performance data:', perfs);

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

module.exports = { calculateRatingClassAndKarma };


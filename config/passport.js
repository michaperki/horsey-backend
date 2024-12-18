// backend/config/passport.js
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");

module.exports = (passport) => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.OAUTH_CLIENT_ID,
        clientSecret: process.env.OAUTH_CLIENT_SECRET,
        callbackURL: process.env.OAUTH_CALLBACK_URL,
      },
      (accessToken, refreshToken, profile, done) => {
        // Log the user profile for debugging
        console.log("Google profile:", profile);

        // Example: Pass the profile to the next stage (store it in a database, etc.)
        return done(null, profile);
      },
    ),
  );

  // Serialize user information into the session
  passport.serializeUser((user, done) => {
    done(null, user);
  });

  // Deserialize user information from the session
  passport.deserializeUser((obj, done) => {
    done(null, obj);
  });
};

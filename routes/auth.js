// src/routes/auth.js
const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const router = express.Router();

// Configure OAuth Strategy
const OAuth2Strategy = require("passport-oauth2").Strategy;

passport.use(
  new OAuth2Strategy(
    {
      authorizationURL: "https://provider.com/oauth2/authorize",
      tokenURL: "https://provider.com/oauth2/token",
      clientID: process.env.OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET,
      callbackURL: process.env.OAUTH_CALLBACK_URL,
    },
    function (accessToken, refreshToken, profile, cb) {
      // TODO: Find or create user in your database
      return cb(null, profile);
    },
  ),
);

// Routes
router.get("/login", passport.authenticate("oauth2"));

router.get(
  "/callback",
  passport.authenticate("oauth2", { failureRedirect: "/" }),
  (req, res) => {
    // Successful authentication, redirect home.
    res.redirect("/");
  },
);

// Admin Login Route (Secure)
router.post("/admin-login", (req, res) => {
  const { username, password } = req.body;

  // Fetch admin credentials from environment variables
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (username === adminUsername && password === adminPassword) {
    const token = jwt.sign(
      { username: "admin", role: "admin" },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );
    return res.json({ token });
  } else {
    return res.status(401).json({ error: "Invalid credentials" });
  }
});

module.exports = router;


// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const passport = require("passport");

const authRoutes = require("./routes/auth");
const paymentsRoutes = require("./routes/payments");
const lichessRoutes = require("./routes/lichess");
const tokenRoutes = require("./routes/tokenRoutes");

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Passport
app.use(passport.initialize());
require("./config/passport")(passport);

// Routes
app.use("/auth", authRoutes);
app.use("/payments", paymentsRoutes);
app.use("/lichess", lichessRoutes);
app.use("/tokens", tokenRoutes);

// Placeholder route
app.get("/", (req, res) => {
  res.send("Chess Betting Backend is running");
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});


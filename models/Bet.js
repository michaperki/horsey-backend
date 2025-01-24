
// backend/models/Bet.js

const mongoose = require('mongoose');

const BetSchema = new mongoose.Schema(
    {
        creatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        opponentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            index: true,
        },
        creatorColor: {
            type: String,
            enum: ['white', 'black', 'random'],
            required: true,
        },
        finalWhiteId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        finalBlackId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        gameId: {
            type: String,
            default: null,
            index: true,
        },
        gameLink: {
            type: String,
            default: null
        },
        amount: {
            type: Number,
            required: true,
            min: [1, 'Bet amount must be at least 1'],
        },
        // **New Field: currencyType**
        currencyType: { // Added currencyType
            type: String,
            enum: ['token', 'sweepstakes'], // Allowed currencies
            default: 'token',
        },
        status: {
            type: String,
            enum: ['pending', 'matched', 'won', 'lost', 'canceled', 'expired', 'draw'], // Added 'draw'
            default: 'pending',
            index: true,
        },
        timeControl: {
            type: String,
            default: '5|3',
        },
        variant: { // **New Field**
            type: String,
            enum: ['standard', 'crazyhouse', 'chess960'], // Add more variants as needed
            default: 'standard',
        },
        expiresAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// Indexes for efficient querying
BetSchema.index({ creatorId: 1, createdAt: -1 });
BetSchema.index({ opponentId: 1, createdAt: -1 });
BetSchema.index({ status: 1, createdAt: -1 });
BetSchema.index({ amount: 1 });
BetSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Bet', BetSchema);


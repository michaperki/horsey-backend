
// backend/models/Notification.js

const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      enum: ['tokensWon', 'betPlaced', 'betAccepted', 'betExpired', 'payment', 'membership', 'other'], // Added 'betExpired'
      default: 'other',
    },
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt fields
);

// Index to optimize queries by user and read status
NotificationSchema.index({ userId: 1, read: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);

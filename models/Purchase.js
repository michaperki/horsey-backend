
const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amountPaid: { type: Number, required: true },
  tokensAwarded: { type: Number, required: true },
  sweepstakesAwarded: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['stripe', 'crypto'], required: true },
  status: { type: String, enum: ['successful', 'failed'], default: 'successful' },
  createdAt: { type: Date, default: Date.now }
});

const Purchase = mongoose.model('Purchase', purchaseSchema);
module.exports = Purchase;

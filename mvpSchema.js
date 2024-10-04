const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MVPSchema = new Schema({
  walletAddress: { type: String, required: true, unique: true },
  user: {
    id: { type: Number, required: true },
    name: { type: String, required: true },
    balance: { type: Number, default: 0 },
    points: { type: Number, default: 0 }
  },
  kuris: [{
    id: { type: Number, required: true },
    contributions: { type: Number, default: 0 },
    prize: { type: Number, default: 0 },
    truthTable: {
      periods: { type: Number, required: true },
      participants: [{
        name: { type: String, required: true },
        statuses: [{
          type: String,
          enum: ['PENDING', 'WON', 'BID', 'PAID', 'UNPAID'],
          required: true
        }]
      }]
    }
  }],
  lastUpdated: { type: Date, default: Date.now }
});

const MVP = mongoose.model('MVP', MVPSchema);

module.exports = MVP;
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// User Schema (unchanged)
const UserSchema = new Schema({
    id: { type: Number, required: true },
    walletAddress: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    balance: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    roscas: [{ type: String, ref: 'ROSCA' }]
});

// ROSCA Schema (unchanged)
const ROSCASchema = new Schema({
    id: { type: Number, required: true },
    contractAddress: { type: String, required: true, unique: true },
    slots: { type: Number, required: true },
    currentRound : { type: Number, required: true },
    participants: [{ type: String }]
});

// Updated UserROSCAStatus Schema
const UserROSCAStatusSchema = new Schema({
    userAddress: { type: String, required: true },
    contractAddress: { type: String, required: true },
    statuses: [{
        round: { type: Number, required: true },
        hasPaid: { type: Boolean, default: false },
        hasBid: { type: Boolean, default: false }
    }],
    participantWonRound: { type: Number, default: 0 },
    hasWon: { type: Boolean, default: false },
    userContributions: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
});

// Create a compound index for userAddress and contractAddress
UserROSCAStatusSchema.index({ userAddress: 1, contractAddress: 1 }, { unique: true });

module.exports = { UserSchema, ROSCASchema, UserROSCAStatusSchema };


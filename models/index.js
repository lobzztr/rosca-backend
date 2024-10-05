const mongoose = require('mongoose');
const { UserSchema, ROSCASchema, UserROSCAStatusSchema } = require('./schema');

const User = mongoose.model('User', UserSchema);
const ROSCA = mongoose.model('ROSCA', ROSCASchema);
const UserROSCAStatus = mongoose.model('UserROSCAStatus', UserROSCAStatusSchema);

module.exports = { User, ROSCA, UserROSCAStatus };

// not the main index.js

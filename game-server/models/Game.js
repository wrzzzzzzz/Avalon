const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  gameType: {
    type: String,
    required: true,
    default: 'avalon'
  },
  maxPlayers: {
    type: Number,
    required: true,
    default: 5,
    min: 5,
    max: 10
  },
  players: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['waiting', 'playing', 'finished'],
    default: 'waiting'
  },
  gameState: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  gameConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  startedAt: Date,
  finishedAt: Date
});

module.exports = mongoose.model('Game', gameSchema);


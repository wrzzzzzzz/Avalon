const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const auth = require('../middleware/auth');

// Game routes
router.get('/', gameController.getAllGames);
router.get('/:gameId', gameController.getGameById);
router.post('/create', auth, gameController.createGame);
router.post('/:gameId/join', auth, gameController.joinGame);
router.post('/:gameId/leave', auth, gameController.leaveGame);
router.delete('/:gameId', auth, gameController.deleteGame);

module.exports = router;


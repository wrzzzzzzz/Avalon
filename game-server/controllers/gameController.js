const Game = require('../models/Game');
const gameService = require('../services/gameService');

const normalizeAvalonCapacity = (game) => {
  if (game.status === 'waiting' && game.maxPlayers < 5) {
    game.maxPlayers = 5;
    if (game.gameState) {
      game.gameState.maxPlayers = 5;
    }
  }
  return game;
};

const sanitizeGame = (game) => {
  const data = game.toObject ? game.toObject() : game;
  if (data.status === 'waiting' && data.maxPlayers < 5) {
    data.maxPlayers = 5;
    if (data.gameState) {
      data.gameState.maxPlayers = 5;
    }
  }
  if (data.gameState?.players) {
    data.gameState = {
      ...data.gameState,
      players: data.gameState.players.map((player) => ({
        id: player.id,
        username: player.username,
        ready: player.ready,
        connected: player.connected
      })),
      votes: {},
      missionVotes: {},
      myRole: null,
      myAlignment: null,
      roleInfo: null,
      allRoles: []
    };
  }
  return data;
};

exports.getAllGames = async (req, res) => {
  try {
    const games = await Game.find({ status: 'waiting' })
      .populate('players', 'username')
      .populate('creator', 'username');
    await Promise.all(games.map((game) => {
      const before = game.maxPlayers;
      normalizeAvalonCapacity(game);
      return before !== game.maxPlayers ? game.save() : Promise.resolve(game);
    }));
    res.json(games.map(sanitizeGame));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getGameById = async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId)
      .populate('players', 'username')
      .populate('creator', 'username');
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const before = game.maxPlayers;
    normalizeAvalonCapacity(game);
    if (before !== game.maxPlayers) {
      await game.save();
    }
    res.json(sanitizeGame(game));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createGame = async (req, res) => {
  try {
    const { gameType, maxPlayers, gameConfig } = req.body;
    const playerCount = Number(maxPlayers) || 5;
    if (playerCount < 5 || playerCount > 10) {
      return res.status(400).json({ error: 'Avalon needs 5-10 players' });
    }

    const game = new Game({
      gameType: gameType || 'avalon',
      maxPlayers: playerCount,
      players: [req.userId],
      creator: req.userId,
      status: 'waiting',
      gameConfig: gameConfig || {}
    });

    await game.populate('players', 'username');
    await game.populate('creator', 'username');
    game.gameState = gameService.createLobby(game);
    await game.save();
    res.status(201).json(sanitizeGame(game));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.joinGame = async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    normalizeAvalonCapacity(game);

    if (game.players.length >= game.maxPlayers) {
      return res.status(400).json({ error: 'Game is full' });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({ error: 'Game already started' });
    }

    if (game.players.some((playerId) => playerId.toString() === req.userId.toString())) {
      return res.status(400).json({ error: 'Already in game' });
    }

    game.players.push(req.userId);
    await game.populate('players', 'username');
    await game.populate('creator', 'username');
    game.gameState = gameService.ensureState(game);
    await game.save();

    res.json(sanitizeGame(game));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.leaveGame = async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({ error: 'Cannot leave after the game starts' });
    }

    game.players = game.players.filter(
      playerId => playerId.toString() !== req.userId.toString()
    );

    await game.populate('players', 'username');
    await game.populate('creator', 'username');
    game.gameState = gameService.ensureState(game);

    await game.save();
    res.json(sanitizeGame(game));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteGame = async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.creator.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Only the host can delete this game' });
    }

    if (game.status === 'playing') {
      return res.status(400).json({ error: 'Cannot delete a game in progress' });
    }

    await Game.findByIdAndDelete(req.params.gameId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


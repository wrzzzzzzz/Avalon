const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Check for required environment variables
if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET environment variable is not set!');
  console.error('Please create a .env file in game-server directory with JWT_SECRET');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/images', express.static('static/images'));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/game-db', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const userRoutes = require('./routes/user');
const auth = require('./middleware/auth');
const Game = require('./models/Game');
const gameService = require('./services/gameService');

app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/user', userRoutes);

const splitEnvUrls = (value) => (value || '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

const buildRtcConfig = () => {
  if (process.env.RTC_ICE_SERVERS) {
    try {
      return {
        iceServers: JSON.parse(process.env.RTC_ICE_SERVERS),
        iceTransportPolicy: process.env.RTC_FORCE_TURN === 'true' ? 'relay' : 'all'
      };
    } catch (error) {
      console.warn('Invalid RTC_ICE_SERVERS. Falling back to split RTC env vars.');
    }
  }

  const iceServers = [
    { urls: splitEnvUrls(process.env.RTC_STUN_URLS || 'stun:stun.l.google.com:19302') }
  ];
  const turnUrls = splitEnvUrls(process.env.RTC_TURN_URLS);
  if (turnUrls.length > 0) {
    iceServers.push({
      urls: turnUrls,
      username: process.env.RTC_TURN_USERNAME,
      credential: process.env.RTC_TURN_CREDENTIAL
    });
  }

  return {
    iceServers,
    iceTransportPolicy: process.env.RTC_FORCE_TURN === 'true' ? 'relay' : 'all'
  };
};

app.get('/api/voice/ice', auth, (req, res) => {
  res.json(buildRtcConfig());
});

// Socket.io connection handling
const socketUsers = new Map();
const voiceRooms = new Map();

const getVoiceRoom = (gameId) => {
  const key = String(gameId);
  if (!voiceRooms.has(key)) {
    voiceRooms.set(key, new Map());
  }
  return voiceRooms.get(key);
};

const publicVoiceUsers = (room) => Array.from(room.values()).map((user) => ({
  userId: user.userId,
  username: user.username,
  muted: user.muted
}));

const leaveVoiceRoom = (socket, gameId) => {
  const key = String(gameId);
  const currentUserId = socketUsers.get(socket.id);
  const room = voiceRooms.get(key);
  if (!room || !currentUserId || !room.has(currentUserId)) {
    return;
  }
  if (room.get(currentUserId).socketId !== socket.id) {
    socket.leave(`voice:${key}`);
    return;
  }

  room.delete(currentUserId);
  socket.leave(`voice:${key}`);
  socket.to(`voice:${key}`).emit('voice-user-left', { userId: currentUserId });
  io.to(`voice:${key}`).emit('voice-users', publicVoiceUsers(room));

  if (room.size === 0) {
    voiceRooms.delete(key);
  }
};

const leaveAllVoiceRooms = (socket) => {
  Array.from(voiceRooms.keys()).forEach((gameId) => leaveVoiceRoom(socket, gameId));
};

const normalizeAvalonCapacity = (game) => {
  if (game.status === 'waiting' && game.maxPlayers < 5) {
    game.maxPlayers = 5;
    if (game.gameState) {
      game.gameState.maxPlayers = 5;
    }
  }
  return game;
};

const publicLobbyGame = (game) => {
  const data = game.toObject ? game.toObject() : game;
  if (data.status === 'waiting' && data.maxPlayers < 5) {
    data.maxPlayers = 5;
    if (data.gameState) {
      data.gameState.maxPlayers = 5;
    }
  }
  if (data.gameState?.players) {
    data.gameState.players = data.gameState.players.map((player) => ({
      id: player.id,
      username: player.username,
      ready: player.ready,
      connected: player.connected
    }));
    data.gameState.votes = {};
    data.gameState.missionVotes = {};
    data.gameState.myRole = null;
    data.gameState.myAlignment = null;
    data.gameState.roleInfo = null;
    data.gameState.allRoles = [];
  }
  return data;
};

const saveAndBroadcast = async (game, state) => {
  normalizeAvalonCapacity(game);
  state.maxPlayers = game.maxPlayers;
  game.gameState = state;
  game.status = state.phase === 'lobby' ? 'waiting' : state.phase === 'finished' ? 'finished' : 'playing';
  if (state.phase !== 'lobby' && !game.startedAt) {
    game.startedAt = new Date();
  }
  if (state.phase === 'finished' && !game.finishedAt) {
    game.finishedAt = new Date();
  }
  await game.save();

  state.players.forEach((player) => {
    io.to(`${game._id}:${player.id}`).emit('game-state', gameService.getViewForPlayer(state, player.id));
  });
};

const loadGame = async (gameId) => {
  const game = await Game.findById(gameId).populate('players', 'username');
  if (!game) {
    throw new Error('Game not found');
  }
  normalizeAvalonCapacity(game);
  return game;
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  const token = socket.handshake.auth?.token;
  let userId = socket.handshake.auth?.userId;

  if (token) {
    try {
      userId = jwt.verify(token, process.env.JWT_SECRET).userId;
    } catch (error) {
      socket.emit('game-error', '登录已过期，请重新登录');
    }
  }
  if (userId) {
    socketUsers.set(socket.id, String(userId));
  }

  // Join game room
  socket.on('join-game', async (gameId) => {
    try {
      const currentUserId = socketUsers.get(socket.id);
      if (!currentUserId) throw new Error('请先登录');
      const game = await loadGame(gameId);
      const inGame = game.players.some((player) => String(player._id) === currentUserId);
      if (!inGame) throw new Error('你还没有加入这个房间');

      socket.join(gameId);
      socket.join(`${gameId}:${currentUserId}`);
      const state = gameService.setConnection(gameService.ensureState(game), currentUserId, true);
      console.log(`User ${socket.id} joined game ${gameId}`);
      await saveAndBroadcast(game, state);
    } catch (error) {
      socket.emit('game-error', error.message);
    }
  });

  // Leave game room
  socket.on('leave-game', async (gameId) => {
    try {
      const currentUserId = socketUsers.get(socket.id);
      leaveVoiceRoom(socket, gameId);
      socket.leave(gameId);
      socket.leave(`${gameId}:${currentUserId}`);
      const game = await loadGame(gameId);
      const state = gameService.setConnection(gameService.ensureState(game), currentUserId, false);
      console.log(`User ${socket.id} left game ${gameId}`);
      await saveAndBroadcast(game, state);
    } catch (error) {
      socket.emit('game-error', error.message);
    }
  });

  socket.on('voice-join', async ({ gameId, username }) => {
    try {
      const currentUserId = socketUsers.get(socket.id);
      if (!currentUserId) throw new Error('请先登录');

      const game = await loadGame(gameId);
      const inGame = game.players.some((player) => String(player._id) === currentUserId);
      if (!inGame) throw new Error('你还没有加入这个房间');

      const room = getVoiceRoom(gameId);
      socket.join(`voice:${gameId}`);
      room.set(currentUserId, {
        userId: currentUserId,
        socketId: socket.id,
        username: username || `玩家 ${room.size + 1}`,
        muted: false
      });

      socket.emit('voice-users', publicVoiceUsers(room));
      socket.to(`voice:${gameId}`).emit('voice-user-joined', {
        userId: currentUserId,
        username: room.get(currentUserId).username,
        muted: false
      });
      io.to(`voice:${gameId}`).emit('voice-users', publicVoiceUsers(room));
    } catch (error) {
      socket.emit('voice-error', error.message);
    }
  });

  socket.on('voice-leave', ({ gameId }) => {
    leaveVoiceRoom(socket, gameId);
  });

  socket.on('voice-muted', ({ gameId, muted }) => {
    const currentUserId = socketUsers.get(socket.id);
    const room = voiceRooms.get(String(gameId));
    if (!currentUserId || !room || !room.has(currentUserId)) {
      return;
    }
    const voiceUser = room.get(currentUserId);
    voiceUser.muted = Boolean(muted);
    io.to(`voice:${gameId}`).emit('voice-users', publicVoiceUsers(room));
  });

  socket.on('voice-signal', ({ gameId, to, signal }) => {
    const currentUserId = socketUsers.get(socket.id);
    const room = voiceRooms.get(String(gameId));
    const target = room?.get(String(to));
    if (!currentUserId || !target) {
      return;
    }
    io.to(target.socketId).emit('voice-signal', {
      from: currentUserId,
      signal
    });
  });

  // Game action handler
  socket.on('game-action', async (data) => {
    try {
      const currentUserId = socketUsers.get(socket.id);
      if (!currentUserId) throw new Error('请先登录');
      const { gameId, action, payload } = data;
      const game = await loadGame(gameId);
      const state = gameService.applyAction(gameService.ensureState(game), currentUserId, action, payload);
      await saveAndBroadcast(game, state);
    } catch (error) {
      socket.emit('game-error', error.message);
    }
  });

  socket.on('lobby-ping', async () => {
    const games = await Game.find({ status: 'waiting' })
      .populate('players', 'username')
      .populate('creator', 'username')
      .sort({ createdAt: -1 });
    await Promise.all(games.map((game) => {
      const before = game.maxPlayers;
      normalizeAvalonCapacity(game);
      return before !== game.maxPlayers ? game.save() : Promise.resolve(game);
    }));
    io.emit('lobby-games', games.map(publicLobbyGame));
  });

  // Disconnect handler
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    leaveAllVoiceRooms(socket);
    socketUsers.delete(socket.id);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, io };


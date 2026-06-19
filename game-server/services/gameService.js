const TEAM_SIZES = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5]
};

const ROLE_SETS = {
  5: ['Merlin', 'Percival', 'Loyal Servant', 'Assassin', 'Morgana'],
  6: ['Merlin', 'Percival', 'Loyal Servant', 'Loyal Servant', 'Assassin', 'Morgana'],
  7: ['Merlin', 'Percival', 'Loyal Servant', 'Loyal Servant', 'Assassin', 'Morgana', 'Mordred'],
  8: ['Merlin', 'Percival', 'Loyal Servant', 'Loyal Servant', 'Loyal Servant', 'Assassin', 'Morgana', 'Mordred'],
  9: ['Merlin', 'Percival', 'Loyal Servant', 'Loyal Servant', 'Loyal Servant', 'Loyal Servant', 'Assassin', 'Morgana', 'Mordred'],
  10: ['Merlin', 'Percival', 'Loyal Servant', 'Loyal Servant', 'Loyal Servant', 'Loyal Servant', 'Assassin', 'Morgana', 'Mordred', 'Oberon']
};

const EVIL_ROLES = new Set(['Assassin', 'Morgana', 'Mordred', 'Oberon', 'Minion of Mordred']);

const clone = (value) => JSON.parse(JSON.stringify(value));

const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const publicPlayer = (player) => ({
  id: player.id,
  username: player.username,
  ready: Boolean(player.ready),
  connected: player.connected !== false
});

class GameService {
  createLobby(gameDoc) {
    const players = this.playersFromDoc(gameDoc).map((player, index) => ({
      ...player,
      ready: index === 0,
      connected: false
    }));

    return {
      phase: 'lobby',
      hostId: players[0]?.id || null,
      players,
      maxPlayers: gameDoc.maxPlayers,
      round: 0,
      leaderIndex: 0,
      proposalNumber: 1,
      selectedTeam: [],
      votes: {},
      missionVotes: {},
      missionHistory: [],
      winner: null,
      log: ['房间已创建，等待玩家准备。']
    };
  }

  ensureState(gameDoc) {
    const state = gameDoc.gameState && gameDoc.gameState.players
      ? clone(gameDoc.gameState)
      : this.createLobby(gameDoc);

    const existingIds = new Set(state.players.map((player) => player.id));
    this.playersFromDoc(gameDoc).forEach((player) => {
      if (!existingIds.has(player.id) && state.phase === 'lobby') {
        state.players.push({ ...player, ready: false, connected: false });
        state.log.push(`${player.username} 加入了房间。`);
      }
    });

    state.players = state.players.filter((player) => (
      this.playersFromDoc(gameDoc).some((docPlayer) => docPlayer.id === player.id)
    ));

    if (!state.hostId && state.players[0]) {
      state.hostId = state.players[0].id;
    }
    return state;
  }

  playersFromDoc(gameDoc) {
    return (gameDoc.players || []).map((player, index) => ({
      id: String(player._id || player),
      username: player.username || `玩家 ${index + 1}`
    }));
  }

  setConnection(state, playerId, connected) {
    const player = state.players.find((item) => item.id === String(playerId));
    if (player) {
      player.connected = connected;
    }
    return state;
  }

  applyAction(state, playerId, action, payload = {}) {
    const next = clone(state);
    const id = String(playerId);
    const player = this.requirePlayer(next, id);

    switch (action) {
      case 'toggle-ready':
        this.requirePhase(next, 'lobby');
        player.ready = !player.ready;
        next.log.push(`${player.username} ${player.ready ? '已准备' : '取消准备'}。`);
        return next;
      case 'start-game':
        return this.startGame(next, id);
      case 'select-team':
        return this.selectTeam(next, id, payload.team || []);
      case 'submit-team':
        if (payload.team) {
          this.selectTeam(next, id, payload.team);
        }
        return this.submitTeam(next, id);
      case 'cast-vote':
        return this.castVote(next, id, Boolean(payload.approve));
      case 'mission-card':
        return this.playMissionCard(next, id, payload.card);
      case 'assassinate':
        return this.assassinate(next, id, payload.targetId);
      case 'reset-game':
        return this.resetToLobby(next, id);
      default:
        throw new Error('未知操作');
    }
  }

  startGame(state, playerId) {
    this.requirePhase(state, 'lobby');
    if (state.hostId !== playerId) throw new Error('只有房主可以开始游戏');
    if (state.players.length < 5 || state.players.length > 10) throw new Error('阿瓦隆需要 5-10 名玩家');
    if (!state.players.every((player) => player.ready)) throw new Error('所有玩家准备后才能开始');

    const roles = shuffle(ROLE_SETS[state.players.length]);
    state.players = shuffle(state.players).map((player, index) => {
      const role = roles[index];
      return {
        ...player,
        role,
        alignment: EVIL_ROLES.has(role) ? 'evil' : 'good'
      };
    });

    state.phase = 'team';
    state.round = 0;
    state.leaderIndex = 0;
    state.proposalNumber = 1;
    state.selectedTeam = [];
    state.votes = {};
    state.missionVotes = {};
    state.missionHistory = [];
    state.winner = null;
    state.log = ['游戏开始。每个人已收到自己的身份信息。'];
    return state;
  }

  selectTeam(state, playerId, team) {
    this.requirePhase(state, 'team');
    this.requireLeader(state, playerId);
    const size = this.currentTeamSize(state);
    const uniqueTeam = [...new Set(team.map(String))];
    if (uniqueTeam.length !== size) throw new Error(`本轮任务需要 ${size} 人`);
    uniqueTeam.forEach((id) => this.requirePlayer(state, id));
    state.selectedTeam = uniqueTeam;
    state.log.push(`${this.currentLeader(state).username} 提名了 ${size} 人任务队伍。`);
    return state;
  }

  submitTeam(state, playerId) {
    this.requirePhase(state, 'team');
    this.requireLeader(state, playerId);
    if (state.selectedTeam.length !== this.currentTeamSize(state)) throw new Error('任务队伍人数不正确');
    state.phase = 'vote';
    state.votes = {};
    state.log.push('开始全员投票是否同意该队伍。');
    return state;
  }

  castVote(state, playerId, approve) {
    this.requirePhase(state, 'vote');
    this.requirePlayer(state, playerId);
    state.votes[playerId] = approve;

    if (Object.keys(state.votes).length !== state.players.length) {
      return state;
    }

    const approvals = Object.values(state.votes).filter(Boolean).length;
    const rejected = approvals <= state.players.length / 2;
    if (rejected) {
      state.log.push(`队伍投票未通过：${approvals} 票同意，${state.players.length - approvals} 票反对。`);
      if (state.proposalNumber >= 5) {
        state.phase = 'finished';
        state.winner = 'evil';
        state.log.push('连续 5 次组队失败，邪恶阵营获胜。');
        return state;
      }
      state.proposalNumber += 1;
      state.leaderIndex = (state.leaderIndex + 1) % state.players.length;
      state.selectedTeam = [];
      state.votes = {};
      state.phase = 'team';
      return state;
    }

    state.phase = 'mission';
    state.missionVotes = {};
    state.log.push(`队伍投票通过：${approvals} 票同意，${state.players.length - approvals} 票反对。任务队员开始出任务牌。`);
    return state;
  }

  playMissionCard(state, playerId, card) {
    this.requirePhase(state, 'mission');
    const player = this.requirePlayer(state, playerId);
    if (!state.selectedTeam.includes(playerId)) throw new Error('只有任务队员可以出任务牌');
    if (!['success', 'fail'].includes(card)) throw new Error('任务牌无效');
    if (card === 'fail' && player.alignment !== 'evil') throw new Error('正义阵营不能破坏任务');
    state.missionVotes[playerId] = card;

    if (Object.keys(state.missionVotes).length !== state.selectedTeam.length) {
      return state;
    }

    const failCount = Object.values(state.missionVotes).filter((vote) => vote === 'fail').length;
    const requiredFails = this.requiredFails(state);
    const failed = failCount >= requiredFails;
    state.missionHistory.push({
      round: state.round + 1,
      team: [...state.selectedTeam],
      failCount,
      requiredFails,
      result: failed ? 'fail' : 'success',
      votes: { ...state.votes }
    });

    state.log.push(`第 ${state.round + 1} 轮任务${failed ? '失败' : '成功'}，出现 ${failCount} 张失败牌。`);

    const successes = state.missionHistory.filter((mission) => mission.result === 'success').length;
    const failures = state.missionHistory.filter((mission) => mission.result === 'fail').length;
    if (failures >= 3) {
      state.phase = 'finished';
      state.winner = 'evil';
      state.log.push('三次任务失败，邪恶阵营获胜。');
      return state;
    }
    if (successes >= 3) {
      const assassin = state.players.find((item) => item.role === 'Assassin');
      state.phase = assassin ? 'assassination' : 'finished';
      state.winner = assassin ? null : 'good';
      state.log.push(assassin ? '三次任务成功。刺客请选择要刺杀的梅林。' : '三次任务成功，正义阵营获胜。');
      return state;
    }

    state.round += 1;
    state.proposalNumber = 1;
    state.leaderIndex = (state.leaderIndex + 1) % state.players.length;
    state.selectedTeam = [];
    state.votes = {};
    state.missionVotes = {};
    state.phase = 'team';
    return state;
  }

  assassinate(state, playerId, targetId) {
    if (!['team', 'vote', 'mission', 'assassination'].includes(state.phase)) {
      throw new Error('当前阶段不能刺杀');
    }
    const assassin = state.players.find((player) => player.role === 'Assassin');
    if (!assassin || assassin.id !== playerId) throw new Error('只有刺客可以刺杀');
    const target = this.requirePlayer(state, String(targetId));
    state.phase = 'finished';
    state.assassinTarget = target.id;
    state.winner = target.role === 'Merlin' ? 'evil' : 'good';
    state.log.push(`刺客选择了 ${target.username}。${state.winner === 'evil' ? '梅林被刺中，邪恶阵营获胜。' : '刺杀失败，正义阵营获胜。'}`);
    return state;
  }

  resetToLobby(state, playerId) {
    if (state.hostId !== playerId) throw new Error('只有房主可以重开');
    const players = state.players.map((player, index) => ({
      id: player.id,
      username: player.username,
      ready: index === 0,
      connected: player.connected,
      role: undefined,
      alignment: undefined
    }));
    return {
      phase: 'lobby',
      hostId: state.hostId,
      players,
      maxPlayers: state.maxPlayers,
      round: 0,
      leaderIndex: 0,
      proposalNumber: 1,
      selectedTeam: [],
      votes: {},
      missionVotes: {},
      missionHistory: [],
      winner: null,
      log: ['房间已重置。']
    };
  }

  getViewForPlayer(state, playerId) {
    const id = String(playerId);
    const viewer = state.players.find((player) => player.id === id);
    const roleInfo = viewer?.role ? this.roleInfo(state, viewer) : null;
    const publicState = {
      ...clone(state),
      players: state.players.map(publicPlayer),
      selectedTeam: [...(state.selectedTeam || [])],
      votes: Object.fromEntries(state.players.map((player) => [player.id, state.votes?.[player.id] === undefined ? null : 'voted'])),
      missionVotes: Object.fromEntries((state.selectedTeam || []).map((teamPlayerId) => [teamPlayerId, state.missionVotes?.[teamPlayerId] === undefined ? null : 'played'])),
      myRole: viewer?.role || null,
      myAlignment: viewer?.alignment || null,
      roleInfo,
      allRoles: state.phase === 'finished'
        ? state.players.map((player) => ({ id: player.id, role: player.role, alignment: player.alignment }))
        : []
    };
    return publicState;
  }

  roleInfo(state, viewer) {
    if (viewer.role === 'Merlin') {
      return {
        title: '梅林视野',
        players: state.players
          .filter((player) => player.alignment === 'evil' && player.role !== 'Mordred')
          .map((player) => player.id)
      };
    }
    if (viewer.role === 'Percival') {
      return {
        title: '派西维尔视野',
        players: state.players
          .filter((player) => ['Merlin', 'Morgana'].includes(player.role))
          .map((player) => player.id)
      };
    }
    if (viewer.alignment === 'evil' && viewer.role !== 'Oberon') {
      return {
        title: '邪恶阵营视野',
        players: state.players
          .filter((player) => player.alignment === 'evil' && player.role !== 'Oberon' && player.id !== viewer.id)
          .map((player) => player.id)
      };
    }
    return { title: '身份信息', players: [] };
  }

  currentTeamSize(state) {
    return TEAM_SIZES[state.players.length][state.round];
  }

  requiredFails(state) {
    return state.players.length >= 7 && state.round === 3 ? 2 : 1;
  }

  currentLeader(state) {
    return state.players[state.leaderIndex];
  }

  requireLeader(state, playerId) {
    if (this.currentLeader(state)?.id !== playerId) throw new Error('当前不是你的队长回合');
  }

  requirePhase(state, phase) {
    if (state.phase !== phase) throw new Error(`当前阶段不能执行该操作`);
  }

  requirePlayer(state, playerId) {
    const player = state.players.find((item) => item.id === playerId);
    if (!player) throw new Error('玩家不在房间中');
    return player;
  }
}

module.exports = new GameService();

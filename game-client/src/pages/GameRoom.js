import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../hooks/useAuth';
import axios from 'axios';
import '../App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const splitUrls = (value) => (value || '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

const buildRtcConfig = () => {
  if (process.env.REACT_APP_RTC_ICE_SERVERS) {
    try {
      const parsed = JSON.parse(process.env.REACT_APP_RTC_ICE_SERVERS);
      return {
        iceServers: parsed,
        iceTransportPolicy: process.env.REACT_APP_FORCE_TURN === 'true' ? 'relay' : 'all'
      };
    } catch (configError) {
      console.warn('Invalid REACT_APP_RTC_ICE_SERVERS. Falling back to split ICE env vars.');
    }
  }

  const iceServers = [
    { urls: splitUrls(process.env.REACT_APP_STUN_URLS || 'stun:stun.l.google.com:19302') }
  ];
  const turnUrls = splitUrls(process.env.REACT_APP_TURN_URLS);
  if (turnUrls.length > 0) {
    iceServers.push({
      urls: turnUrls,
      username: process.env.REACT_APP_TURN_USERNAME,
      credential: process.env.REACT_APP_TURN_CREDENTIAL
    });
  }

  return {
    iceServers,
    iceTransportPolicy: process.env.REACT_APP_FORCE_TURN === 'true' ? 'relay' : 'all'
  };
};

const DEFAULT_RTC_CONFIG = buildRtcConfig();

const PHASE_LABELS = {
  lobby: '等待准备',
  team: '队长组队',
  vote: '全员投票',
  mission: '任务执行',
  assassination: '刺客刺杀',
  finished: '游戏结束'
};

const ROLE_TEXT = {
  Merlin: '梅林：你知道大部分坏人，但要隐藏自己。',
  Percival: '派西维尔：你看到梅林和莫甘娜，但不知道谁是真的。',
  'Loyal Servant': '忠臣：保护梅林，帮助任务成功。',
  Assassin: '刺客：破坏任务，最后尝试刺杀梅林。',
  Morgana: '莫甘娜：伪装成梅林，迷惑派西维尔。',
  Mordred: '莫德雷德：梅林看不到你。',
  Oberon: '奥伯伦：坏人阵营，但你和其他坏人互相不知道。'
};

const teamSizes = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5]
};

const getInitial = (name) => (name || '?').trim().slice(0, 1).toUpperCase();

const getRoleTheme = (role) => {
  if (['Assassin', 'Morgana', 'Mordred', 'Oberon'].includes(role)) return 'evil';
  if (role) return 'good';
  return 'unknown';
};

const RoleIcon = ({ role }) => {
  const theme = getRoleTheme(role);
  const commonProps = {
    className: `role-icon ${theme}`,
    viewBox: '0 0 64 64',
    'aria-hidden': 'true'
  };

  if (role === 'Merlin') {
    return (
      <svg {...commonProps}>
        <path d="M32 6l6 17 18 1-14 11 5 18-15-10-15 10 5-18L8 24l18-1 6-17z" />
        <circle cx="32" cy="32" r="8" />
      </svg>
    );
  }
  if (role === 'Percival') {
    return (
      <svg {...commonProps}>
        <path d="M32 7l21 10v15c0 13-8 22-21 25-13-3-21-12-21-25V17L32 7z" />
        <path d="M22 33h20M32 21v24" />
      </svg>
    );
  }
  if (role === 'Assassin') {
    return (
      <svg {...commonProps}>
        <path d="M47 5l12 12-31 31-12 4 4-12L47 5z" />
        <path d="M38 14l12 12M15 49l-8 8" />
      </svg>
    );
  }
  if (role === 'Morgana') {
    return (
      <svg {...commonProps}>
        <path d="M14 46c6-16 30-16 36 0-7 8-29 8-36 0z" />
        <path d="M20 25c5-10 19-15 28-4-2 15-22 17-28 4z" />
        <circle cx="29" cy="29" r="3" />
      </svg>
    );
  }
  if (role === 'Mordred') {
    return (
      <svg {...commonProps}>
        <path d="M13 52l7-35 12-8 12 8 7 35H13z" />
        <path d="M21 28h22M25 40h14" />
      </svg>
    );
  }
  if (role === 'Oberon') {
    return (
      <svg {...commonProps}>
        <circle cx="32" cy="32" r="20" />
        <path d="M12 32h40M32 12v40M19 19l26 26M45 19L19 45" />
      </svg>
    );
  }
  if (role === 'Loyal Servant') {
    return (
      <svg {...commonProps}>
        <path d="M32 8l18 8v15c0 12-7 21-18 25-11-4-18-13-18-25V16l18-8z" />
        <path d="M23 34l6 6 13-16" />
      </svg>
    );
  }
  return (
    <svg {...commonProps}>
      <rect x="15" y="9" width="34" height="46" rx="5" />
      <path d="M24 25c0-6 4-10 9-10s9 4 9 9c0 8-10 8-10 15M32 48h.01" />
    </svg>
  );
};

const DaggerIcon = ({ className = '' }) => (
  <svg className={`dagger-icon ${className}`} viewBox="0 0 80 80" aria-hidden="true">
    <path d="M58 4l18 18-32 29-15-15L58 4z" />
    <path d="M25 33l22 22-7 7-22-22 7-7z" />
    <path d="M14 42l24 24-7 8L6 50l8-8z" />
  </svg>
);

const GameRoom = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const { user } = useAuth();
  const [game, setGame] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceUsers, setVoiceUsers] = useState([]);
  const [voiceError, setVoiceError] = useState('');
  const [roleRevealOpen, setRoleRevealOpen] = useState(false);
  const [roleRevealFlipped, setRoleRevealFlipped] = useState(false);
  const [roleRevealReady, setRoleRevealReady] = useState(false);
  const [leaderNotice, setLeaderNotice] = useState(null);
  const [assassinationTarget, setAssassinationTarget] = useState(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const remoteAudioRef = useRef(new Map());
  const voiceAudioRootRef = useRef(null);
  const joiningVoiceRef = useRef(false);
  const voiceJoinedRef = useRef(false);
  const previousRoleRef = useRef(null);
  const previousLeaderNoticeRef = useRef('');
  const rtcConfigRef = useRef(DEFAULT_RTC_CONFIG);

  const myId = String(user?.id || user?._id || '');

  const fetchGame = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/game/${gameId}`);
      setGame(response.data);
    } catch (fetchError) {
      navigate('/home');
    } finally {
      setLoading(false);
    }
  }, [gameId, navigate]);

  useEffect(() => {
    fetchGame();
  }, [fetchGame]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleState = (state) => {
      setError('');
      setGameState(state);
      setSelectedTeam(state.selectedTeam || []);
    };

    socket.emit('join-game', gameId);
    socket.on('game-state', handleState);
    socket.on('game-error', setError);

    return () => {
      socket.emit('leave-game', gameId);
      socket.off('game-state', handleState);
      socket.off('game-error', setError);
    };
  }, [socket, gameId]);

  const cleanupPeer = useCallback((peerId) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }

    const audio = remoteAudioRef.current.get(peerId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      remoteAudioRef.current.delete(peerId);
    }
  }, []);

  const cleanupVoice = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    remoteAudioRef.current.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    remoteAudioRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    joiningVoiceRef.current = false;
    voiceJoinedRef.current = false;
    setVoiceJoined(false);
    setVoiceMuted(false);
    setVoiceUsers([]);
  }, []);

  const createPeerConnection = useCallback((peerId) => {
    if (peerConnectionsRef.current.has(peerId)) {
      return peerConnectionsRef.current.get(peerId);
    }

    const pc = new RTCPeerConnection(rtcConfigRef.current);
    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('voice-signal', {
          gameId,
          to: peerId,
          signal: { type: 'ice', candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      let audio = remoteAudioRef.current.get(peerId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        remoteAudioRef.current.set(peerId, audio);
        voiceAudioRootRef.current?.appendChild(audio);
      }
      audio.srcObject = event.streams[0];
      audio.play().catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        if (pc.connectionState === 'failed') {
          setVoiceError('语音连接失败：请确认已配置可用的 TURN 服务器。');
        }
        cleanupPeer(peerId);
      }
    };

    peerConnectionsRef.current.set(peerId, pc);
    return pc;
  }, [cleanupPeer, gameId, socket]);

  const startVoiceOffer = useCallback(async (peerId) => {
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('voice-signal', {
      gameId,
      to: peerId,
      signal: { type: 'offer', sdp: offer }
    });
  }, [createPeerConnection, gameId, socket]);

  const handleVoiceSignal = useCallback(async ({ from, signal }) => {
    try {
      if (!localStreamRef.current || !signal) return;
      const pc = createPeerConnection(from);

      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice-signal', {
          gameId,
          to: from,
          signal: { type: 'answer', sdp: answer }
        });
      }

      if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      }

      if (signal.type === 'ice' && signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (voiceSignalError) {
      setVoiceError('语音连接失败，请重新加入语音房。');
    }
  }, [createPeerConnection, gameId, socket]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleVoiceUsers = (users) => {
      setVoiceUsers(users);
      if (joiningVoiceRef.current) {
        users
          .filter((voiceUser) => voiceUser.userId !== myId)
          .forEach((voiceUser) => startVoiceOffer(voiceUser.userId));
        joiningVoiceRef.current = false;
      }
    };
    const handleVoiceUserLeft = ({ userId }) => cleanupPeer(userId);
    const handleVoiceError = (message) => setVoiceError(message);

    socket.on('voice-users', handleVoiceUsers);
    socket.on('voice-user-left', handleVoiceUserLeft);
    socket.on('voice-signal', handleVoiceSignal);
    socket.on('voice-error', handleVoiceError);

    return () => {
      socket.off('voice-users', handleVoiceUsers);
      socket.off('voice-user-left', handleVoiceUserLeft);
      socket.off('voice-signal', handleVoiceSignal);
      socket.off('voice-error', handleVoiceError);
      if (voiceJoinedRef.current) {
        socket.emit('voice-leave', { gameId });
      }
      cleanupVoice();
    };
  }, [cleanupPeer, cleanupVoice, gameId, handleVoiceSignal, myId, socket, startVoiceOffer]);

  const sendAction = (action, payload = {}) => {
    if (!socket) return;
    socket.emit('game-action', { gameId, action, payload });
  };

  const leaveGame = async () => {
    try {
      await axios.post(`${API_URL}/api/game/${gameId}/leave`);
    } catch (leaveError) {
      if (gameState?.phase === 'lobby') {
        setError(leaveError.response?.data?.error || '离开房间失败');
        return;
      }
    }
    navigate('/home');
  };

  const playersById = useMemo(() => {
    const map = new Map();
    (gameState?.players || []).forEach((player) => map.set(player.id, player));
    return map;
  }, [gameState]);

  const currentLeader = gameState?.players?.[gameState?.leaderIndex];
  const isHost = gameState?.hostId === myId;
  const isLeader = currentLeader?.id === myId;
  const isMissionMember = gameState?.selectedTeam?.includes(myId);
  const currentTeamSize = gameState ? teamSizes[gameState.players.length]?.[gameState.round] : 0;
  const readyCount = gameState?.players?.filter((player) => player.ready).length || 0;
  const canAssassinate = gameState?.myRole === 'Assassin'
    && ['team', 'vote', 'mission', 'assassination'].includes(gameState?.phase);

  useEffect(() => {
    if (gameState?.myRole && previousRoleRef.current !== gameState.myRole) {
      previousRoleRef.current = gameState.myRole;
      setRoleRevealFlipped(false);
      setRoleRevealReady(false);
      setRoleRevealOpen(true);
    }
    if (!gameState?.myRole) {
      previousRoleRef.current = null;
      setRoleRevealFlipped(false);
      setRoleRevealReady(false);
      setRoleRevealOpen(false);
    }
  }, [gameState?.myRole]);

  useEffect(() => {
    if (!roleRevealOpen) return undefined;
    setRoleRevealFlipped(false);
    setRoleRevealReady(false);
    const flipTimer = window.setTimeout(() => {
      setRoleRevealFlipped(true);
    }, 900);
    const readyTimer = window.setTimeout(() => {
      setRoleRevealReady(true);
    }, 3000);
    return () => {
      window.clearTimeout(flipTimer);
      window.clearTimeout(readyTimer);
    };
  }, [roleRevealOpen]);

  useEffect(() => {
    if (gameState?.phase !== 'team' || !currentLeader) return;
    const noticeKey = `${gameState.round}-${gameState.proposalNumber}-${currentLeader.id}`;
    if (previousLeaderNoticeRef.current === noticeKey) return;
    previousLeaderNoticeRef.current = noticeKey;
    setLeaderNotice({
      round: gameState.round + 1,
      proposalNumber: gameState.proposalNumber,
      leaderName: currentLeader.username
    });
  }, [currentLeader, gameState?.phase, gameState?.proposalNumber, gameState?.round]);

  const namesFromIds = (ids) => ids
    .map((id) => playersById.get(id)?.username)
    .filter(Boolean)
    .join('、') || '-';

  const toggleTeamMember = (playerId) => {
    if (!isLeader || gameState?.phase !== 'team') return;
    setSelectedTeam((current) => {
      if (current.includes(playerId)) {
        return current.filter((id) => id !== playerId);
      }
      if (current.length >= currentTeamSize) {
        return current;
      }
      return [...current, playerId];
    });
  };

  const submitTeamSelection = () => {
    sendAction('submit-team', { team: selectedTeam });
  };

  const handleAssassinate = (targetId) => {
    if (!canAssassinate || assassinationTarget) return;
    setAssassinationTarget(targetId);
    window.setTimeout(() => {
      sendAction('assassinate', { targetId });
      setAssassinationTarget(null);
    }, 720);
  };

  const joinVoiceRoom = async () => {
    try {
      setVoiceError('');
      if (!navigator.mediaDevices?.getUserMedia) {
        setVoiceError('当前浏览器不支持语音功能。');
        return;
      }

      try {
        const response = await axios.get(`${API_URL}/api/voice/ice`);
        rtcConfigRef.current = response.data;
      } catch (iceConfigError) {
        rtcConfigRef.current = DEFAULT_RTC_CONFIG;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localStreamRef.current = stream;
      joiningVoiceRef.current = true;
      voiceJoinedRef.current = true;
      setVoiceJoined(true);
      setVoiceMuted(false);
      socket.emit('voice-join', { gameId, username: user?.username });
    } catch (microphoneError) {
      setVoiceError('无法打开麦克风，请检查浏览器权限。');
      cleanupVoice();
    }
  };

  const leaveVoiceRoom = () => {
    socket?.emit('voice-leave', { gameId });
    cleanupVoice();
  };

  const toggleVoiceMuted = () => {
    const nextMuted = !voiceMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setVoiceMuted(nextMuted);
    socket?.emit('voice-muted', { gameId, muted: nextMuted });
  };

  if (loading) {
    return <div className="container avalon-shell">正在进入房间...</div>;
  }

  if (!gameState) {
    return (
      <div className="container avalon-shell">
        <div className="empty-state">正在连接实时房间...</div>
      </div>
    );
  }

  return (
    <div className="container avalon-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">房间 #{gameId.slice(-6)}</p>
          <h1>{PHASE_LABELS[gameState.phase]}</h1>
        </div>
        <div className="topbar-actions">
          <span className="user-chip">{user?.username}</span>
          <button onClick={() => navigate('/home')} className="btn btn-secondary">大厅</button>
          <button onClick={leaveGame} className="btn btn-danger">离开</button>
        </div>
      </header>

      {error && <div className="notice notice-error">{error}</div>}

      {roleRevealOpen && gameState.myRole && (
        <div className="cinematic-backdrop">
          <div className={`role-reveal-card ${getRoleTheme(gameState.myRole)} ${roleRevealFlipped ? 'flipped' : ''}`}>
            <div className="role-reveal-inner">
              {!roleRevealFlipped ? (
                <div className="role-card-content role-card-back">
                <span>AVALON</span>
                <strong>命运之牌</strong>
              </div>
              ) : (
                <div className="role-card-content role-card-front">
                  <RoleIcon role={gameState.myRole} />
                  <p className="eyebrow">你的身份</p>
                  <h2>{gameState.myRole}</h2>
                  <p>{ROLE_TEXT[gameState.myRole]}</p>
                  <button
                    onClick={() => setRoleRevealOpen(false)}
                    className="btn btn-primary"
                    disabled={!roleRevealReady}
                  >
                    {roleRevealReady ? '确定' : '请记住你的身份...'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {leaderNotice && (
        <div className="leader-notice">
          <div>
            <p className="eyebrow">第 {leaderNotice.round} 轮发言开始</p>
            <h2>{leaderNotice.leaderName} 是本轮车主</h2>
            <p>车主负责提名任务队伍，圆桌成员随后投票。</p>
          </div>
          <button onClick={() => setLeaderNotice(null)} className="btn btn-primary">知道了</button>
        </div>
      )}

      <section className="game-layout">
        <main className="game-main">
          <div className="status-strip">
            <div>
              <span>玩家</span>
              <strong>{gameState.players.length} / {game?.maxPlayers || gameState.maxPlayers}</strong>
            </div>
            <div>
              <span>轮次</span>
              <strong>{gameState.round + 1} / 5</strong>
            </div>
            <div>
              <span>组队尝试</span>
              <strong>{gameState.proposalNumber} / 5</strong>
            </div>
            <div>
              <span>队长</span>
              <strong>{currentLeader?.username || '-'}</strong>
            </div>
          </div>

          <div className="mission-track">
            {[0, 1, 2, 3, 4].map((index) => {
              const mission = gameState.missionHistory[index];
              const size = teamSizes[gameState.players.length]?.[index];
              const doubleFail = gameState.players.length >= 7 && index === 3;
              return (
                <div key={index} className={`mission-node ${mission?.result || ''} ${gameState.round === index ? 'active' : ''}`}>
                  <span>任务 {index + 1}</span>
                  <strong>{mission ? (mission.result === 'success' ? '成功' : '失败') : `${size} 人`}</strong>
                  {doubleFail && <small>需 2 失败</small>}
                </div>
              );
            })}
          </div>

          <section className="round-table-area">
            <div className="round-table">
              <div className="table-center">
                <span>AVALON</span>
                <strong>圆桌议会</strong>
                <small>第 {gameState.round + 1} 轮 · {currentLeader?.username || '-'} 驾车</small>
              </div>
              {gameState.players.map((player, index) => {
                const inTeam = selectedTeam.includes(player.id);
                const visibleInfo = gameState.roleInfo?.players?.includes(player.id);
                const revealed = gameState.allRoles?.find((role) => role.id === player.id);
                const isCurrentLeader = player.id === currentLeader?.id;
                const angle = (360 / gameState.players.length) * index - 90;
                return (
                  <button
                    key={player.id}
                    style={{ '--seat-angle': `${angle}deg` }}
                    className={`player-seat ${inTeam ? 'selected' : ''} ${visibleInfo ? 'known' : ''} ${isCurrentLeader ? 'leader' : ''} ${assassinationTarget === player.id ? 'assassination-hit' : ''}`}
                    onClick={() => toggleTeamMember(player.id)}
                  >
                    <span className="seat-orbit" />
                    <span className="player-avatar">
                      <span className={`connection ${player.connected ? 'online' : ''}`} />
                      <strong>{getInitial(player.username)}</strong>
                      {assassinationTarget === player.id && <DaggerIcon className="stab-dagger" />}
                    </span>
                    <span className="seat-name">{player.username}</span>
                    <span className="seat-meta">
                      {player.id === gameState.hostId ? '房主 ' : ''}
                      {isCurrentLeader ? '车长 ' : ''}
                      {player.ready ? '已准备' : '未准备'}
                    </span>
                    {isCurrentLeader && <span className="leader-badge">车长</span>}
                    {visibleInfo && <em>{gameState.roleInfo.title}</em>}
                    {revealed && <em>{revealed.role}</em>}
                  </button>
                );
              })}
            </div>
          </section>
        </main>

        <aside className="side-panel">
          <div className={`identity-card ${gameState.myAlignment || ''}`}>
            <p className="eyebrow">你的身份</p>
            <div className={`role-card-mini ${getRoleTheme(gameState.myRole)}`}>
              <RoleIcon role={gameState.myRole} />
              <div>
                <h2>{gameState.myRole || '等待开局'}</h2>
                <p>{gameState.myRole ? ROLE_TEXT[gameState.myRole] : `已准备 ${readyCount} / ${gameState.players.length}`}</p>
              </div>
            </div>
            {gameState.roleInfo?.players?.length > 0 && (
              <div className="info-list">
                <span>{gameState.roleInfo.title}</span>
                <strong>{gameState.roleInfo.players.map((id) => playersById.get(id)?.username).join('、')}</strong>
              </div>
            )}
          </div>

          <div className="action-panel voice-panel">
            <h3>语音房</h3>
            {voiceError && <p className="voice-error">{voiceError}</p>}
            <div className="voice-users">
              {voiceUsers.length ? (
                voiceUsers.map((voiceUser) => (
                  <span key={voiceUser.userId}>
                    {voiceUser.username}{voiceUser.userId === myId ? '（你）' : ''}{voiceUser.muted ? ' · 静音' : ''}
                  </span>
                ))
              ) : (
                <span>还没有人加入语音。</span>
              )}
            </div>
            <div className="button-row">
              {!voiceJoined ? (
                <button onClick={joinVoiceRoom} className="btn btn-primary">加入语音</button>
              ) : (
                <>
                  <button onClick={toggleVoiceMuted} className="btn btn-secondary">
                    {voiceMuted ? '取消静音' : '静音'}
                  </button>
                  <button onClick={leaveVoiceRoom} className="btn btn-danger">离开语音</button>
                </>
              )}
            </div>
            <div ref={voiceAudioRootRef} className="voice-audio-root" />
          </div>

          {gameState.phase === 'lobby' && (
            <div className="action-panel">
              <h3>准备阶段</h3>
              <button onClick={() => sendAction('toggle-ready')} className="btn btn-primary">切换准备</button>
              <button onClick={() => sendAction('start-game')} className="btn btn-secondary" disabled={!isHost}>开始游戏</button>
              <p>需要 5-10 名玩家，且所有玩家准备后房主才能开始。</p>
            </div>
          )}

          {gameState.phase === 'team' && (
            <div className="action-panel">
              <h3>选择任务队伍</h3>
              <p>本轮需要 {currentTeamSize} 人。{isLeader ? '点击玩家卡片选择队伍。' : '等待队长选择队伍。'}</p>
              <div className="team-preview">
                {selectedTeam.map((id) => <span key={id}>{playersById.get(id)?.username}</span>)}
              </div>
              <button onClick={submitTeamSelection} className="btn btn-primary" disabled={!isLeader || selectedTeam.length !== currentTeamSize}>提交队伍</button>
            </div>
          )}

          {gameState.phase === 'vote' && (
            <div className="action-panel">
              <h3>投票</h3>
              <p>队伍：{gameState.selectedTeam.map((id) => playersById.get(id)?.username).join('、')}</p>
              <div className="vote-grid">
                {gameState.players.map((player) => (
                  <span key={player.id}>{player.username}: {gameState.votes[player.id] ? '已投' : '未投'}</span>
                ))}
              </div>
              <div className="button-row">
                <button onClick={() => sendAction('cast-vote', { approve: true })} className="btn btn-primary">同意</button>
                <button onClick={() => sendAction('cast-vote', { approve: false })} className="btn btn-danger">反对</button>
              </div>
            </div>
          )}

          {gameState.phase === 'mission' && (
            <div className="action-panel">
              <h3>任务牌</h3>
              <p>{isMissionMember ? '选择你的任务牌。正义阵营只能出成功。' : '等待任务队员出牌。'}</p>
              <div className="vote-grid">
                {gameState.selectedTeam.map((id) => (
                  <span key={id}>{playersById.get(id)?.username}: {gameState.missionVotes[id] ? '已出牌' : '未出牌'}</span>
                ))}
              </div>
              <div className="button-row">
                <button onClick={() => sendAction('mission-card', { card: 'success' })} className="btn btn-primary" disabled={!isMissionMember}>成功</button>
                <button onClick={() => sendAction('mission-card', { card: 'fail' })} className="btn btn-danger" disabled={!isMissionMember || gameState.myAlignment !== 'evil'}>失败</button>
              </div>
            </div>
          )}

          {canAssassinate && (
            <div className="action-panel">
              <h3>刺杀梅林</h3>
              <p>你可以在游戏进行中的任意阶段刺杀。选中梅林则邪恶阵营获胜，选错则正义阵营获胜。</p>
              <div className="assassin-grid">
                {gameState.players.filter((player) => player.id !== myId).map((player) => (
                  <button key={player.id} onClick={() => handleAssassinate(player.id)} disabled={Boolean(assassinationTarget)} className="btn btn-secondary assassin-target-button">
                    <DaggerIcon />
                    {player.username}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gameState.phase === 'finished' && (
            <div className="action-panel">
              <h3>{gameState.winner === 'good' ? '正义阵营胜利' : '邪恶阵营胜利'}</h3>
              <button onClick={() => sendAction('reset-game')} className="btn btn-primary" disabled={!isHost}>重开</button>
            </div>
          )}

          <div className="log-panel mission-history-panel">
            <h3>任务结果</h3>
            {gameState.missionHistory?.length ? (
              gameState.missionHistory.map((mission) => {
                const approveIds = Object.entries(mission.votes || {})
                  .filter(([, approved]) => approved)
                  .map(([id]) => id);
                const rejectIds = Object.entries(mission.votes || {})
                  .filter(([, approved]) => !approved)
                  .map(([id]) => id);
                return (
                  <div key={mission.round} className="mission-summary">
                    <strong>第 {mission.round} 局：{mission.result === 'success' ? '成功' : '失败'}</strong>
                    <span>任务队伍：{namesFromIds(mission.team || [])}</span>
                    <span>同意：{namesFromIds(approveIds)}</span>
                    <span>反对：{namesFromIds(rejectIds)}</span>
                    <span>失败牌：{mission.failCount} / {mission.requiredFails}</span>
                  </div>
                );
              })
            ) : (
              <p>还没有完成的任务。</p>
            )}
          </div>

          <div className="log-panel">
            <h3>记录</h3>
            {(gameState.log || []).slice(-8).reverse().map((item, index) => (
              <p key={`${item}-${index}`}>{item}</p>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
};

export default GameRoom;

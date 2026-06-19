import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import axios from 'axios';
import '../App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const Home = () => {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(5);

  const myId = String(user?.id || user?._id || '');

  useEffect(() => {
    fetchGames();
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    socket.emit('lobby-ping');
    socket.on('lobby-games', setGames);
    return () => socket.off('lobby-games', setGames);
  }, [socket]);

  const fetchGames = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/game`);
      setGames(response.data);
    } catch (error) {
      console.error('Failed to fetch games:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGame = async (event) => {
    event.preventDefault();
    try {
      const response = await axios.post(`${API_URL}/api/game/create`, {
        gameType: 'avalon',
        maxPlayers: Number(maxPlayers)
      });
      navigate(`/game/${response.data._id}`);
    } catch (error) {
      alert(error.response?.data?.error || '创建房间失败');
    }
  };

  const handleJoinGame = async (gameId) => {
    try {
      await axios.post(`${API_URL}/api/game/${gameId}/join`);
      navigate(`/game/${gameId}`);
    } catch (error) {
      alert(error.response?.data?.error || '加入房间失败');
    }
  };

  const handleDeleteGame = async (gameId) => {
    const confirmed = window.confirm('确定删除这个房间吗？这个操作不能撤销。');
    if (!confirmed) return;

    try {
      await axios.delete(`${API_URL}/api/game/${gameId}`);
      setGames((currentGames) => currentGames.filter((game) => game._id !== gameId));
      socket?.emit('lobby-ping');
    } catch (error) {
      alert(error.response?.data?.error || '删除房间失败');
    }
  };

  return (
    <div className="container avalon-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">The Resistance</p>
          <h1>阿瓦隆在线房间</h1>
        </div>
        <div className="topbar-actions">
          <span>{user?.username}</span>
          <button onClick={() => navigate('/profile')} className="btn btn-secondary">资料</button>
          <button onClick={logout} className="btn btn-danger">退出</button>
        </div>
      </header>

      <section className="lobby-hero">
        <div>
          <h2>创建一局 5-10 人阿瓦隆</h2>
          <p>实时组队、投票、任务、刺杀和语音房都已经接好。每个玩家只会看到自己的身份与阵营信息。</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">创建房间</button>
      </section>

      <div className="section-title">
        <h2>等待中的房间</h2>
        <button onClick={fetchGames} className="btn btn-secondary">刷新</button>
      </div>

      {loading ? (
        <div className="empty-state">正在读取房间...</div>
      ) : games.length === 0 ? (
        <div className="empty-state">还没有开放房间，先开一局吧。</div>
      ) : (
        <div className="room-grid">
          {games.map((game) => {
            const playerCount = game.players?.length || 0;
            const full = playerCount >= game.maxPlayers;
            const hostId = String(game.creator?._id || game.creator || '');
            const hostName = game.creator?.username || '未知房主';
            const isHost = hostId === myId;

            return (
              <article key={game._id} className="room-card">
                <div className="room-card-main">
                  <p className="eyebrow">房间 #{game._id.slice(-6)}</p>
                  <h3>{playerCount} / {game.maxPlayers} 人</h3>
                  <p><strong>房主：</strong>{hostName}</p>
                  <p>{game.players?.map((player) => player.username).join('、') || '等待玩家'}</p>
                </div>
                <div className="room-actions">
                  <button
                    onClick={() => handleJoinGame(game._id)}
                    className="btn btn-primary"
                    disabled={full}
                  >
                    {full ? '已满' : '加入'}
                  </button>
                  {isHost && (
                    <button
                      onClick={() => handleDeleteGame(game._id)}
                      className="btn btn-danger"
                    >
                      删除
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <div className="modal-backdrop">
          <form className="modal-panel" onSubmit={handleCreateGame}>
            <h2>创建阿瓦隆房间</h2>
            <div className="form-group">
              <label>人数上限</label>
              <input
                type="number"
                value={maxPlayers}
                onChange={(event) => setMaxPlayers(event.target.value)}
                min="5"
                max="10"
                required
              />
            </div>
            <div className="button-row">
              <button type="submit" className="btn btn-primary">创建</button>
              <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary">取消</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Home;

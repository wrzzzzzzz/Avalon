import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import axios from 'axios';
import '../App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/user/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Profile</h1>
        <div>
          <button onClick={() => navigate('/home')} className="btn btn-secondary" style={{ marginRight: '10px' }}>
            Home
          </button>
          <button onClick={logout} className="btn btn-danger">
            Logout
          </button>
        </div>
      </header>

      <div className="card">
        <h2>User Information</h2>
        <p><strong>Username:</strong> {user?.username}</p>
      </div>

      {loading ? (
        <div className="card">Loading stats...</div>
      ) : (
        <div className="card">
          <h2>Game Statistics</h2>
          <p><strong>Games Played:</strong> {stats?.gamesPlayed || 0}</p>
          <p><strong>Games Won:</strong> {stats?.gamesWon || 0}</p>
          <p><strong>Total Score:</strong> {stats?.totalScore || 0}</p>
        </div>
      )}
    </div>
  );
};

export default Profile;


import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import './Dashboard.css';

export default function Dashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.dashboard.analytics(), api.learning.sessions()])
      .then(([analyticsRes, sessionsRes]) => {
        setAnalytics(analyticsRes.analytics);
        setSessions(sessionsRes.sessions);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading dashboard...
      </div>
    );
  }

  const a = analytics || {};

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your personalized learning overview</p>
        </div>
        <Link to="/sessions/new" className="btn btn-primary">
          + New Learning Session
        </Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card card">
          <span className="stat-label">Learning Streak</span>
          <span className="stat-value">🔥 {a.streak || 0} days</span>
        </div>
        <div className="stat-card card">
          <span className="stat-label">Accuracy</span>
          <span className="stat-value">{a.accuracy || 0}%</span>
        </div>
        <div className="stat-card card">
          <span className="stat-label">Avg Mastery</span>
          <span className="stat-value">{a.avgMastery || 0}%</span>
        </div>
        <div className="stat-card card">
          <span className="stat-label">Time Studied</span>
          <span className="stat-value">{a.timeStudiedFormatted || '0m'}</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <h2>Recent Sessions</h2>
          {sessions.length === 0 ? (
            <div className="empty-state">
              <h3>No sessions yet</h3>
              <p>Upload study material or enter a topic to get started.</p>
              <Link to="/sessions/new" className="btn btn-primary" style={{ marginTop: '1rem' }}>
                Create Session
              </Link>
            </div>
          ) : (
            <div className="session-list">
              {sessions.slice(0, 5).map((s) => (
                <Link key={s._id} to={`/sessions/${s._id}`} className="session-item">
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.subject} · {s.difficulty}</p>
                  </div>
                  <span className={`badge badge-${statusColor(s.analysisStatus)}`}>
                    {s.analysisStatus}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2>Weak Topics</h2>
          {!a.weakTopics?.length ? (
            <p className="empty-text">Complete a quiz to identify weak areas.</p>
          ) : (
            <div className="topic-list">
              {a.weakTopics.map((t) => (
                <div key={t._id} className="topic-item">
                  <span>{t.topic}</span>
                  <div className="topic-mastery">
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${t.mastery}%`, background: 'var(--danger)' }} />
                    </div>
                    <span>{t.mastery}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function statusColor(status) {
  if (status === 'completed') return 'success';
  if (status === 'processing') return 'warning';
  if (status === 'failed') return 'danger';
  return 'primary';
}

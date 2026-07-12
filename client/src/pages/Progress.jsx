import { useEffect, useState } from 'react';
import { api } from '../services/api';
import './Progress.css';

export default function Progress() {
  const [analytics, setAnalytics] = useState(null);
  const [progress, setProgress] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.dashboard.analytics(),
      api.dashboard.progress(),
      api.quiz.history(),
    ])
      .then(([analyticsRes, progressRes, historyRes]) => {
        setAnalytics(analyticsRes.analytics);
        setProgress(progressRes.progress);
        setHistory(historyRes.attempts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading progress...
      </div>
    );
  }

  const a = analytics || {};

  return (
    <div>
      <h1 className="page-title">Progress & Analytics</h1>
      <p className="page-subtitle">Track mastery, weak areas, and learning streaks</p>

      <div className="stats-grid">
        <div className="stat-card card">
          <span className="stat-label">Total Quizzes</span>
          <span className="stat-value">{a.totalQuizzes || 0}</span>
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
          <span className="stat-label">Streak</span>
          <span className="stat-value">🔥 {a.streak || 0}</span>
        </div>
      </div>

      <div className="progress-grid">
        <section className="card">
          <h2>Topic Mastery</h2>
          {progress.length === 0 ? (
            <p className="empty-text">Complete quizzes to build your knowledge graph.</p>
          ) : (
            <div className="mastery-list">
              {progress.map((p) => (
                <div key={p._id} className="mastery-item">
                  <div className="mastery-info">
                    <strong>{p.topic}</strong>
                    <span className="subject-tag">{p.subject}</span>
                  </div>
                  <div className="mastery-bars">
                    <div className="bar-row">
                      <span>Mastery</span>
                      <div className="progress-bar">
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${p.mastery}%`,
                            background: p.mastery >= 70 ? 'var(--success)' : p.mastery >= 40 ? 'var(--warning)' : 'var(--danger)',
                          }}
                        />
                      </div>
                      <span>{p.mastery}%</span>
                    </div>
                    <div className="bar-row">
                      <span>Accuracy</span>
                      <div className="progress-bar">
                        <div className="progress-bar-fill" style={{ width: `${p.accuracy}%` }} />
                      </div>
                      <span>{p.accuracy}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2>Strong Topics</h2>
          {!a.strongTopics?.length ? (
            <p className="empty-text">Keep learning to identify strengths.</p>
          ) : (
            a.strongTopics.map((t) => (
              <div key={t._id} className="topic-row">
                <span>{t.topic}</span>
                <span className="badge badge-success">{t.mastery}%</span>
              </div>
            ))
          )}

          <h2 style={{ marginTop: '1.5rem' }}>Weak Topics</h2>
          {!a.weakTopics?.length ? (
            <p className="empty-text">No weak topics yet.</p>
          ) : (
            a.weakTopics.map((t) => (
              <div key={t._id} className="topic-row">
                <span>{t.topic}</span>
                <span className="badge badge-danger">{t.mastery}%</span>
              </div>
            ))
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: '1.5rem' }}>
        <h2>Quiz History</h2>
        {history.length === 0 ? (
          <p className="empty-text">No quiz attempts yet.</p>
        ) : (
          <div className="history-list">
            {history.map((h) => (
              <div key={h._id} className="history-item">
                <div>
                  <strong>{h.sessionId?.title || 'Quiz'}</strong>
                  <p>{h.sessionId?.subject} · {new Date(h.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="history-score">
                  <span className={`badge badge-${h.passed ? 'success' : 'warning'}`}>
                    {h.score}/{h.totalQuestions}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

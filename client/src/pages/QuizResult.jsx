import { useLocation, useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '../services/api';
import './Quiz.css';

function buildResultFromAttempt(attempt) {
  return {
    score: attempt.score,
    total: attempt.totalQuestions,
    passed: attempt.passed,
    weakTopics: attempt.weakTopics || [],
    strongTopics: attempt.strongTopics || [],
    overallFeedback: attempt.recommendations || '',
    studyPlan: null,
    attempt,
  };
}

export default function QuizResult() {
  const { id } = useParams();
  const location = useLocation();
  const [fetched, setFetched] = useState(null);
  const [loading, setLoading] = useState(false);

  const result = location.state?.result || fetched;

  // On a browser refresh the router state is lost, so recover the attempt
  // from the user's quiz history using the quiz id from the URL.
  useEffect(() => {
    if (location.state?.result || fetched) return;
    setLoading(true);
    api.quiz
      .history()
      .then(({ attempts }) => {
        const attempt = attempts.find((a) => a.quizId && a.quizId._id === id);
        if (attempt) setFetched(buildResultFromAttempt(attempt));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, location.state, fetched]);

  if (!result) {
    return (
      <div className="empty-state">
        {loading ? (
          <p>Loading results…</p>
        ) : (
          <>
            <h3>No results found</h3>
            <Link to="/dashboard">Back to Dashboard</Link>
          </>
        )}
      </div>
    );
  }

  const { score, total, passed, weakTopics, overallFeedback, studyPlan, attempt } = result;
  const pct = Math.round((score / total) * 100);

  return (
    <div className="quiz-result">
      <div className={`result-banner card ${passed ? 'passed' : 'failed'}`}>
        <h1>{passed ? '🎉 Great Job!' : '📚 Keep Learning'}</h1>
        <div className="score-display">
          <span className="score-num">{score}/{total}</span>
          <span className="score-pct">{pct}%</span>
        </div>
        {overallFeedback && <p className="feedback">{overallFeedback}</p>}
      </div>

      <div className="card section">
        <h2>Evaluation Details</h2>
        {attempt?.answers?.map((a, i) => (
          <div key={i} className={`eval-item ${a.isCorrect ? 'correct' : 'wrong'}`}>
            <div className="eval-header">
              <span>Question {i + 1}</span>
              <span className={`badge badge-${a.isCorrect ? 'success' : 'danger'}`}>
                {a.isCorrect ? 'Correct' : 'Wrong'}
              </span>
              {!a.isCorrect && a.confidence && (
                <span className="confidence">Confidence: {a.confidence}%</span>
              )}
            </div>
            {!a.isCorrect && a.reason && <p className="eval-reason">{a.reason}</p>}
            {!a.isCorrect && a.weakTopic && (
              <span className="badge badge-warning">Weak: {a.weakTopic}</span>
            )}
          </div>
        ))}
      </div>

      {weakTopics?.length > 0 && (
        <div className="card section">
          <h2>Weak Topics Identified</h2>
          <div className="weak-tags">
            {weakTopics.map((t, i) => (
              <span key={i} className="badge badge-danger">{t}</span>
            ))}
          </div>
        </div>
      )}

      {studyPlan && (
        <div className="card section">
          <h2>Study Planner Agent — Today's Plan</h2>
          <p>{studyPlan.dailyPlan}</p>
          <p className="plan-duration">Estimated: {studyPlan.estimatedDuration}</p>
          {studyPlan.topics?.map((t, i) => (
            <div key={i} className="plan-topic">
              <strong>{t.name}</strong> · {t.duration}
              <ul>
                {t.activities?.map((a, j) => <li key={j}>{a}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="result-actions">
        <Link to="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
        <Link to="/progress" className="btn btn-secondary">View Progress</Link>
      </div>
    </div>
  );
}

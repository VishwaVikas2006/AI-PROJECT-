import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import './SessionDetail.css';

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quizLoading, setQuizLoading] = useState(false);
  const [flashcardsLoading, setFlashcardsLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [studyPlanLoading, setStudyPlanLoading] = useState(false);
  const [flashcards, setFlashcards] = useState(null);
  const [summary, setSummary] = useState(null);
  const [studyPlan, setStudyPlan] = useState(null);
  const [questionCount, setQuestionCount] = useState(5);

  const fetchSession = useCallback(async () => {
    try {
      const { session: s } = await api.learning.session(id);
      setSession(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSession();
    const interval = setInterval(() => {
      if (session?.analysisStatus === 'processing' || session?.analysisStatus === 'pending') {
        fetchSession();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchSession, session?.analysisStatus]);

  useEffect(() => {
    if (session) {
      if (!summary && session.studySummary) {
        setSummary(session.studySummary);
      }
      if (!flashcards && Array.isArray(session.flashcards) && session.flashcards.length > 0) {
        setFlashcards(session.flashcards);
      }
    }
  }, [session, summary, flashcards]);

  const handleGenerateQuiz = async (regenerate = false) => {
    setQuizLoading(true);
    try {
      const { quiz } = await api.quiz.generate({ sessionId: id, questionCount, regenerate });
      navigate(`/quiz/${quiz._id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setQuizLoading(false);
    }
  };

  const handleFlashcards = async (regenerate = false) => {
    setFlashcardsLoading(true);
    try {
      const res = await api.ai.flashcards({ sessionId: id, regenerate, count: 5 });
      setFlashcards(res.flashcards);
    } catch (err) {
      alert(err.message);
    } finally {
      setFlashcardsLoading(false);
    }
  };

  const handleSummary = async (regenerate = false) => {
    setSummaryLoading(true);
    try {
      const res = await api.ai.summary({ sessionId: id, regenerate });
      setSummary(res.summary);
    } catch (err) {
      alert(err.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleStudyPlan = async (regenerate = false) => {
    setStudyPlanLoading(true);
    try {
      const res = await api.ai.studyPlan({ sessionId: id, regenerate });
      setStudyPlan(res.studyPlan);
    } catch (err) {
      alert(err.message);
    } finally {
      setStudyPlanLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading session...
      </div>
    );
  }

  if (!session) {
    return <div className="empty-state"><h3>Session not found</h3><Link to="/dashboard">Back to Dashboard</Link></div>;
  }

  const isAnalyzing = session.analysisStatus === 'pending' || session.analysisStatus === 'processing';
  const canGenerateQuiz = session.analysisStatus === 'completed' && Array.isArray(session.topics) && session.topics.length > 0 && !quizLoading;

  return (
    <div>
      <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>
      <h1 className="page-title">{session.title}</h1>
      <p className="page-subtitle">{session.subject}</p>

      {isAnalyzing && (
        <div className="card analyzing-banner">
          <div className="spinner" />
          <div>
            <strong>AI is analyzing your content...</strong>
            <p>Extracting topics, difficulty, learning objectives, and summary.</p>
          </div>
        </div>
      )}

      {session.analysisStatus === 'failed' && (
        <div className="card error-banner">
          <strong>Analysis failed:</strong> {session.analysisError}
          <button className="btn btn-secondary" onClick={() => api.learning.reanalyze(id).then(fetchSession)}>
            Retry Analysis
          </button>
        </div>
      )}

      {session.analysisStatus === 'completed' && (
        <>
          <div className="analysis-grid">
            <div className="card">
              <h3>Difficulty</h3>
              <span className="badge badge-primary">{session.difficulty}</span>
            </div>
            <div className="card">
              <h3>Study Time</h3>
              <p className="highlight">{session.estimatedTime}</p>
            </div>
            <div className="card">
              <h3>Topics</h3>
              <p className="highlight">{session.topics?.length || 0}</p>
            </div>
            {session.keywords?.length > 0 && (
              <div className="card">
                <h3>Keywords</h3>
                <div className="keywords-list">
                  {session.keywords.map((keyword, index) => (
                    <span key={index} className="keyword-pill">{keyword}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card section">
            <h2>Topics</h2>
            <div className="topics-grid">
              {session.topics?.map((t, i) => (
                <div key={i} className="topic-card">
                  <span className="topic-check">✔</span>
                  <div>
                    <strong>{t.name}</strong>
                    {t.description && <p>{t.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {session.learningObjectives?.length > 0 && (
            <div className="card section">
              <h2>Learning Objectives</h2>
              <ul className="objectives-list">
                {session.learningObjectives.map((obj, i) => (
                  <li key={i}>{obj}</li>
                ))}
              </ul>
            </div>
          )}

          {session.summary && (
            <div className="card section">
              <h2>Summary</h2>
              <p className="summary-text">{session.summary}</p>
            </div>
          )}

          <div className="action-bar">
              <div className="quiz-settings">
              <label htmlFor="questionCount">Questions</label>
              <select
                id="questionCount"
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
              >
                <option value={5}>5</option>
              </select>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => handleGenerateQuiz(false)}
              disabled={!canGenerateQuiz || quizLoading}
            >
              {quizLoading ? 'Generating Quiz...' : `Generate ${questionCount}-Question Quiz`}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleGenerateQuiz(true)}
              disabled={!canGenerateQuiz || quizLoading}
            >
              {quizLoading ? 'Regenerating...' : 'Regenerate Quiz'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleFlashcards(false)}
              disabled={flashcardsLoading}
            >
              {flashcardsLoading ? 'Generating Flashcards...' : 'Flashcards'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleFlashcards(true)}
              disabled={flashcardsLoading}
            >
              {flashcardsLoading ? 'Regenerating...' : 'Regenerate Flashcards'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleSummary(false)}
              disabled={summaryLoading}
            >
              {summaryLoading ? 'Generating Summary...' : 'Study Summary'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleSummary(true)}
              disabled={summaryLoading}
            >
              {summaryLoading ? 'Regenerating...' : 'Regenerate Summary'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleStudyPlan(false)}
              disabled={studyPlanLoading}
            >
              {studyPlanLoading ? 'Generating Study Plan...' : 'Study Plan'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleStudyPlan(true)}
              disabled={studyPlanLoading}
            >
              {studyPlanLoading ? 'Regenerating...' : 'Regenerate Study Plan'}
            </button>
          </div>

          {flashcards && flashcards.length > 0 && (
            <div className="card section">
              <h2>Flashcards</h2>
              <div className="flashcards-grid">
                {flashcards.map((fc, i) => (
                  <div key={i} className="flashcard">
                    <p className="fc-front">{fc.question || fc.front}</p>
                    <p className="fc-back">{fc.answer || fc.back}</p>
                    {fc.topic && <span className="badge badge-primary">{fc.topic}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary && (
            <div className="card section">
              <h2>Quick Summary</h2>
              <p>{summary.summary || summary}</p>
              {summary.keyTakeaways && summary.keyTakeaways.length > 0 && (
                <>
                  <h3 style={{ marginTop: '1rem' }}>Key Takeaways</h3>
                  <ul className="objectives-list">
                    {summary.keyTakeaways.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </>
              )}
              {summary.reviewTips && summary.reviewTips.length > 0 && (
                <>
                  <h3 style={{ marginTop: '1rem' }}>Review Tips</h3>
                  <ul className="objectives-list">
                    {summary.reviewTips.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </>
              )}
            </div>
          )}

          {studyPlan && (
            <div className="card section">
              <h2>Today's Study Plan</h2>
              <p>{studyPlan.dailyPlan}</p>
              <p className="plan-duration">Estimated: {studyPlan.estimatedDuration}</p>
              {studyPlan.topics?.map((t, i) => (
                <div key={i} className="plan-topic">
                  <strong>{t.name}</strong> · {t.duration} · <span className={`badge badge-${t.priority === 'high' ? 'danger' : 'warning'}`}>{t.priority}</span>
                  <ul className="objectives-list">
                    {t.activities?.map((a, j) => <li key={j}>{a}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

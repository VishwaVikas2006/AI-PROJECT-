import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import './SessionDetail.css';

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify, withLoading } = useToast();

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
  const [pollError, setPollError] = useState(false);

  // Two independent abort controllers:
  //  - pollAbortRef  -> the background session-GET poll
  //  - actionAbortRef -> AI button requests (quiz/flashcards/summary/study plan)
  // They must stay SEPARATE: cancelling an AI action must never abort
  // the poll, otherwise the poll's in-flight GET shows up as "cancelled"
  // in the Network tab and the page silently loses its live status.
  const mountedRef = useRef(true);
  const pollAbortRef = useRef(new AbortController());
  const actionAbortRef = useRef(new AbortController());

  useEffect(() => {
    // In React 18 Strict Mode, components mount -> unmount -> remount.
    // We must reset these refs on mount so they aren't permanently dead.
    mountedRef.current = true;
    pollAbortRef.current = new AbortController();
    actionAbortRef.current = new AbortController();

    return () => {
      mountedRef.current = false;
      pollAbortRef.current?.abort();
      actionAbortRef.current?.abort();
    };
  }, []);

  const fetchSession = useCallback(async () => {
    try {
      const { session: s } = await api.learning.session(id, pollAbortRef.current.signal);
      if (!mountedRef.current) return;
      setPollError(false);
      setSession(s);
    } catch (err) {
      if (err?.name === 'AbortError' || err?.isCanceled) return;
      // Surface backend/network failures instead of silently retrying forever
      // while the UI sits on the "AI is analyzing…" banner.
      if (!pollError) {
        setPollError(true);
        notify({ type: 'error', title: 'Lost connection to server', message: err.message });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [id, notify, pollError]);

  useEffect(() => {
    fetchSession();
    const interval = setInterval(() => {
      if (pollError) return;
      if (session?.analysisStatus === 'processing' || session?.analysisStatus === 'pending') {
        fetchSession();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchSession, session?.analysisStatus, pollError]);

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

  // Run an AI action behind the global loading bar; on failure, show a toast
  // with an inline Retry button (and never a raw browser alert). The in-flight
  // request is aborted (a) when a new action starts, and (b) on unmount.
  // Uses actionAbortRef ONLY — never the poll controller.
  const runAction = useCallback(
    async ({ label, fn, onSuccess, errorTitle }) => {
      // Cancel only the previous AI action, never the background session poll.
      actionAbortRef.current?.abort();
      const controller = new AbortController();
      actionAbortRef.current = controller;

      try {
        const result = await withLoading(label, () => fn(controller.signal));
        if (!mountedRef.current) return;
        onSuccess?.(result);
      } catch (err) {
        // Cancellations (navigation / new action) are expected — ignore them.
        if (err?.name === 'AbortError' || err?.isCanceled) return;
        if (!mountedRef.current) return;
        notify({
          type: 'error',
          title: errorTitle || 'Could not complete this action',
          message: err.message,
          action: {
            label: 'Retry',
            onClick: () => runAction({ label, fn, onSuccess, errorTitle }),
          },
        });
      }
    },
    [notify, withLoading],
  );

  const handleGenerateQuiz = (regenerate = false) => {
    if (quizLoading) return;
    setQuizLoading(true);
    runAction({
      label: regenerate ? 'Regenerating your quiz…' : 'Generating your quiz…',
      fn: (signal) => api.quiz.generate({ sessionId: id, questionCount, regenerate }, signal),
      onSuccess: ({ quiz }) => navigate(`/quiz/${quiz._id}`),
      errorTitle: 'Quiz generation failed',
    }).finally(() => { if (mountedRef.current) setQuizLoading(false); });
  };

  const handleFlashcards = (regenerate = false) => {
    if (flashcardsLoading) return;
    setFlashcardsLoading(true);
    runAction({
      label: regenerate ? 'Regenerating flashcards…' : 'Generating flashcards…',
      fn: (signal) => api.ai.flashcards({ sessionId: id, regenerate, count: 5 }, signal),
      onSuccess: ({ flashcards: fc }) => setFlashcards(fc),
      errorTitle: 'Flashcard generation failed',
    }).finally(() => { if (mountedRef.current) setFlashcardsLoading(false); });
  };

  const handleSummary = (regenerate = false) => {
    if (summaryLoading) return;
    setSummaryLoading(true);
    runAction({
      label: regenerate ? 'Regenerating summary…' : 'Generating summary…',
      fn: (signal) => api.ai.summary({ sessionId: id, regenerate }, signal),
      onSuccess: ({ summary: s }) => setSummary(s),
      errorTitle: 'Summary generation failed',
    }).finally(() => { if (mountedRef.current) setSummaryLoading(false); });
  };

  const handleStudyPlan = (regenerate = false) => {
    if (studyPlanLoading) return;
    setStudyPlanLoading(true);
    runAction({
      label: regenerate ? 'Regenerating study plan…' : 'Generating study plan…',
      fn: (signal) => api.ai.studyPlan({ sessionId: id, regenerate }, signal),
      onSuccess: ({ studyPlan: sp }) => setStudyPlan(sp),
      errorTitle: 'Study plan generation failed',
    }).finally(() => { if (mountedRef.current) setStudyPlanLoading(false); });
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
  const hasFlashcards = Array.isArray(flashcards) && flashcards.length > 0;
  const hasSummary = Boolean(summary);
  const hasStudyPlan = Boolean(studyPlan);

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

          {/* ---------- Action bar: grouped, primary action stands out ---------- */}
          <div className="action-bar">
            <div className="action-primary">
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
                className="btn btn-primary btn-generate"
                onClick={() => handleGenerateQuiz(false)}
                disabled={!canGenerateQuiz}
              >
                {quizLoading && <span className="btn-spinner" />}
                {quizLoading ? 'Generating Quiz…' : `Generate ${questionCount}-Question Quiz`}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => handleGenerateQuiz(true)}
                disabled={!canGenerateQuiz}
                title="Regenerate Quiz"
              >
                {quizLoading ? <span className="btn-spinner" /> : '↻'}
                {quizLoading ? '' : 'Regenerate'}
              </button>
            </div>

            <div className="action-divider" />

            <div className="action-group">
              <div className="action-cell">
                <span className="action-label">Flashcards</span>
                <div className="action-cell-btns">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleFlashcards(false)}
                    disabled={flashcardsLoading}
                  >
                    {flashcardsLoading && <span className="btn-spinner" />}
                    {flashcardsLoading ? 'Generating…' : 'Generate'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleFlashcards(true)}
                    disabled={flashcardsLoading}
                    title="Regenerate Flashcards"
                  >
                    ↻
                  </button>
                </div>
              </div>

              <div className="action-cell">
                <span className="action-label">Study Summary</span>
                <div className="action-cell-btns">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleSummary(false)}
                    disabled={summaryLoading}
                  >
                    {summaryLoading && <span className="btn-spinner" />}
                    {summaryLoading ? 'Generating…' : 'Generate'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleSummary(true)}
                    disabled={summaryLoading}
                    title="Regenerate Summary"
                  >
                    ↻
                  </button>
                </div>
              </div>

              <div className="action-cell">
                <span className="action-label">Study Plan</span>
                <div className="action-cell-btns">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleStudyPlan(false)}
                    disabled={studyPlanLoading}
                  >
                    {studyPlanLoading && <span className="btn-spinner" />}
                    {studyPlanLoading ? 'Generating…' : 'Generate'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleStudyPlan(true)}
                    disabled={studyPlanLoading}
                    title="Regenerate Study Plan"
                  >
                    ↻
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- Flashcards ---------- */}
          {hasFlashcards ? (
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
          ) : (
            <div className="card section empty-hint">
              <h2>Flashcards</h2>
              <p>No flashcards generated yet. Generate a set to start memorizing key concepts.</p>
            </div>
          )}

          {/* ---------- Summary ---------- */}
          {hasSummary ? (
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
          ) : (
            <div className="card section empty-hint">
              <h2>Quick Summary</h2>
              <p>No summary generated yet. Generate one to get a concise recap of this material.</p>
            </div>
          )}

          {/* ---------- Study Plan ---------- */}
          {hasStudyPlan ? (
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
          ) : (
            <div className="card section empty-hint">
              <h2>Study Plan</h2>
              <p>No study plan generated yet. Generate a plan to structure your revision.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

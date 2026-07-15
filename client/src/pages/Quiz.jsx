import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import './Quiz.css';

export default function Quiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify, withLoading } = useToast();
  const [quiz, setQuiz] = useState(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [startTime] = useState(Date.now());
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);

  // Cancel in-flight requests on unmount/route change; prevent state updates
  // after unmount.
  const mountedRef = useRef(true);
  const abortRef = useRef(new AbortController());

  useEffect(() => {
    mountedRef.current = true;
    abortRef.current = new AbortController();

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    api.quiz.get(id, abortRef.current.signal)
      .then(({ quiz: q }) => {
        if (!mountedRef.current) return;
        setQuiz(q);
        setAnswers(q.questions.map(() => ({ userAnswer: '' })));
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || err?.isCanceled) return;
        if (mountedRef.current) notify({ type: 'error', title: 'Could not load quiz', message: err.message });
      })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [id, notify]);

  const question = quiz?.questions[current];

  const setAnswer = (value) => {
    const updated = [...answers];
    updated[current] = { userAnswer: value };
    setAnswers(updated);
  };

  const handleExplain = useCallback(async () => {
    if (!answers[current]?.userAnswer || explaining) return;
    setExplaining(true);
    abortRef.current?.abort();
    const signal = (abortRef.current = new AbortController()).signal;
    try {
      const res = await withLoading('Generating explanation…', () =>
        api.ai.explain({
          question: question.question,
          userAnswer: answers[current].userAnswer,
          correctAnswer: question.correctAnswer,
          options: question.options,
        }, signal),
      );
      if (!mountedRef.current) return;
      setExplanation(res.explanation);
    } catch (err) {
      if (err?.name === 'AbortError' || err?.isCanceled) return;
      if (!mountedRef.current) return;
      notify({
        type: 'error',
        title: 'Could not explain answer',
        message: err.message,
        action: { label: 'Retry', onClick: handleExplain },
      });
    } finally {
      if (mountedRef.current) setExplaining(false);
    }
  }, [answers, current, explaining, question, notify, withLoading]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    abortRef.current?.abort();
    const signal = (abortRef.current = new AbortController()).signal;
    try {
      const timeTaken = Math.round((Date.now() - startTime) / 1000);
      const result = await withLoading('Evaluating your answers…', () =>
        api.quiz.submit({
          quizId: id,
          answers,
          timeTaken,
        }, signal),
      );
      if (!mountedRef.current) return;
      navigate(`/quiz/${id}/result`, { state: { result } });
    } catch (err) {
      if (err?.name === 'AbortError' || err?.isCanceled) return;
      if (!mountedRef.current) return;
      notify({
        type: 'error',
        title: 'Could not submit quiz',
        message: err.message,
        action: { label: 'Retry', onClick: handleSubmit },
      });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading quiz...
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="empty-state">
        <h3>Quiz not found</h3>
        <p>This quiz may not be available yet or an error occurred while loading it.</p>
      </div>
    );
  }

  const totalQuestions = quiz.questions?.length || 0;
  const progress = totalQuestions > 0 ? ((current + 1) / totalQuestions) * 100 : 0;
  const allAnswered = answers.length === totalQuestions && answers.every((a) => a.userAnswer);

  return (
    <div className="quiz-page">
      <div className="quiz-header">
        <h1>{quiz.title || 'Adaptive Quiz'}</h1>
        <span className="badge badge-primary">{quiz.difficulty}</span>
      </div>

      <div className="quiz-progress">
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <span>Question {current + 1} of {quiz.questions.length}</span>
      </div>

      <div className="card quiz-question">
        {!question ? (
          <div className="empty-state">
            <h3>Question not available</h3>
            <p>This question is missing or could not be loaded.</p>
          </div>
        ) : (
          <>
            <div className="question-meta">
              <span className="badge badge-primary">{(question.type || 'short_answer').replace('_', ' ')}</span>
              {question.topic && <span className="topic-tag">{question.topic}</span>}
            </div>

            <h2>{question.question}</h2>

            {(question.type === 'mcq' || question.type === 'true_false') ? (
              <div className="options-list">
                {(question.options || []).map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`option-btn ${answers[current]?.userAnswer === opt ? 'selected' : ''}`}
                    onClick={() => setAnswer(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                value={answers[current]?.userAnswer || ''}
                onChange={(e) => setAnswer(e.target.value)}
                rows={4}
                placeholder="Type your answer..."
              />
            )}
          </>
        )}

        <button
          className="btn btn-secondary explain-btn"
          onClick={handleExplain}
          disabled={!answers[current]?.userAnswer || explaining}
        >
          {explaining && <span className="btn-spinner" />}
          {explaining ? 'Generating Explanation…' : 'Explain (before submit)'}
        </button>

        {explanation && (
          <div className="explanation-box">
            <h4>AI Explanation</h4>
            <p>{explanation.explanation}</p>
            {explanation.realWorldExample && <p><strong>Example:</strong> {explanation.realWorldExample}</p>}
            {explanation.interviewTip && <p><strong>Tip:</strong> {explanation.interviewTip}</p>}
          </div>
        )}
      </div>

      <div className="quiz-nav">
        <button
          className="btn btn-secondary"
          onClick={() => { setCurrent(current - 1); setExplanation(null); }}
          disabled={current === 0}
        >
          Previous
        </button>

        {current < quiz.questions.length - 1 ? (
          <button
            className="btn btn-primary"
            onClick={() => { setCurrent(current + 1); setExplanation(null); }}
            disabled={!answers[current]?.userAnswer}
          >
            Next
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
          >
            {submitting && <span className="btn-spinner" />}
            {submitting ? 'Evaluating…' : 'Submit Quiz'}
          </button>
        )}
      </div>
    </div>
  );
}

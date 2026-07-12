import Progress from '../models/Progress.js';
import Attempt from '../models/Attempt.js';
import LearningSession from '../models/LearningSession.js';
import StudyPlan from '../models/StudyPlan.js';

export async function getProgress(req, res, next) {
  try {
    const progress = await Progress.find({ user: req.userId }).sort({ mastery: -1 });
    res.json({ progress });
  } catch (err) {
    next(err);
  }
}

export async function getAnalytics(req, res, next) {
  try {
    const [attempts, sessions, progress, plans] = await Promise.all([
      Attempt.find({ user: req.userId }),
      LearningSession.find({ user: req.userId }).countDocuments(),
      Progress.find({ user: req.userId }),
      StudyPlan.find({ user: req.userId, completed: false }).countDocuments(),
    ]);

    const totalQuestions = attempts.reduce((sum, a) => sum + a.totalQuestions, 0);
    const totalCorrect = attempts.reduce((sum, a) => sum + a.score, 0);
    const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const timeStudied = attempts.reduce((sum, a) => sum + (a.timeTaken || 0), 0);

    const strongTopics = progress.filter((p) => p.mastery >= 70).slice(0, 5);
    const weakTopics = progress.filter((p) => p.mastery < 50).sort((a, b) => a.mastery - b.mastery).slice(0, 5);

    const avgMastery =
      progress.length > 0
        ? Math.round(progress.reduce((sum, p) => sum + p.mastery, 0) / progress.length)
        : 0;

    const streak = calculateStreak(attempts);

    res.json({
      analytics: {
        totalSessions: sessions,
        totalQuizzes: attempts.length,
        accuracy,
        avgMastery,
        timeStudied,
        timeStudiedFormatted: formatDuration(timeStudied),
        streak,
        strongTopics,
        weakTopics,
        activeStudyPlans: plans,
        recentAttempts: attempts.slice(-5).reverse(),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getWeakTopics(req, res, next) {
  try {
    const weakTopics = await Progress.find({
      user: req.userId,
      mastery: { $lt: 50 },
    }).sort({ mastery: 1 });

    res.json({ weakTopics });
  } catch (err) {
    next(err);
  }
}

function calculateStreak(attempts) {
  if (!attempts.length) return 0;

  const dates = [...new Set(attempts.map((a) => new Date(a.createdAt).toDateString()))].sort(
    (a, b) => new Date(b) - new Date(a)
  );

  let streak = 0;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  for (let i = 0; i < dates.length; i++) {
    const expected = new Date(Date.now() - i * 86400000).toDateString();
    if (dates.includes(expected)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

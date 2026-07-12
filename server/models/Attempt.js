import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userAnswer: String,
    isCorrect: Boolean,
    confidence: Number,
    reason: String,
    weakTopic: String,
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningSession', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    answers: [answerSchema],
    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    weakTopics: [String],
    strongTopics: [String],
    recommendations: String,
    timeTaken: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Attempt', attemptSchema);

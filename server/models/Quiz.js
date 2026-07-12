import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['mcq', 'true_false', 'short_answer', 'coding'],
      required: true,
    },
    topic: String,
    question: { type: String, required: true },
    options: [String],
    correctAnswer: { type: String, required: true },
    explanation: String,
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
  },
  { _id: true }
);

const quizSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningSession', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: String,
    questions: [questionSchema],
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    questionCount: { type: Number, default: 0 },
    plan: {
      topics: [String],
      reasoning: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Quiz', quizSchema);

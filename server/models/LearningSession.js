import mongoose from 'mongoose';

const topicSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
  },
  { _id: false }
);

const flashcardSchema = new mongoose.Schema(
  {
    question: String,
    answer: String,
    example: String,
    commonMistake: String,
    topic: String,
  },
  { _id: false }
);

const studySummarySchema = new mongoose.Schema(
  {
    summary: String,
    keyTakeaways: [String],
    reviewTips: [String],
    details: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const learningSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    subject: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ['upload', 'paste', 'topic', 'youtube'],
      required: true,
    },
    sourceContent: String,
    filePath: String,
    fileName: String,
    summary: String,
    difficulty: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      default: 'Intermediate',
    },
    estimatedTime: String,
    learningObjectives: [String],
    keywords: [String],
    topics: [topicSchema],
    flashcards: [flashcardSchema],
    studySummary: studySummarySchema,
    analysisStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    analysisError: String,
  },
  { timestamps: true }
);

export default mongoose.model('LearningSession', learningSessionSchema);

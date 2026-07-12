import mongoose from 'mongoose';

const studyPlanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningSession' },
    topics: [
      {
        name: String,
        priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
        duration: String,
        activities: [String],
        completed: { type: Boolean, default: false },
      },
    ],
    dailyPlan: String,
    estimatedDuration: String,
    date: { type: Date, default: Date.now },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('StudyPlan', studyPlanSchema);

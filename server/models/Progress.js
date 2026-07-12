import mongoose from 'mongoose';

const progressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true },
    topic: { type: String, required: true },
    accuracy: { type: Number, default: 0 },
    mastery: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    lastStudied: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

progressSchema.index({ user: 1, subject: 1, topic: 1 }, { unique: true });

export default mongoose.model('Progress', progressSchema);

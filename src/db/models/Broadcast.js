import mongoose from "mongoose";

const broadcastSchema = new mongoose.Schema({
  // For drafts
  draftId: { type: String, unique: true, sparse: true, index: true },
  isDraft: { type: Boolean, default: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  savedBy: { type: String, default: "admin" },

  // For sent broadcasts (results)
  broadcastId: { type: String, unique: true, sparse: true, index: true },
  phoneNumbers: [String],
  totalRequested: { type: Number, default: 0 },
  totalSent: { type: Number, default: 0 },
  totalFailed: { type: Number, default: 0 },
  failedNumbers: [{
    number: String,
    reason: String,
  }],
  successNumbers: [String],

  // Metadata
  sentAt: { type: Date, default: null },
  durationSeconds: { type: Number, default: 0 },
  filename: String,
  notes: String,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

// Index for queries
broadcastSchema.index({ isDraft: 1, createdAt: -1 });
broadcastSchema.index({ broadcastId: 1 });
broadcastSchema.index({ sentAt: 1 });

export default mongoose.model("Broadcast", broadcastSchema);

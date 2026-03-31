import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  role:      { type: String, enum: ["user", "assistant"], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Number, default: Date.now },
  mediaUrl:  { type: String, default: null },
}, { _id: false });

const leadDataSchema = new mongoose.Schema({
  name:              String,
  email:             String,
  phone:             String,
  country:           String,
  budget:            String,
  propertyInterest:  String,
  preferredLocation: String,
  timeline:          String,
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  userId:        { type: String, required: true, unique: true, index: true },
  history:       [messageSchema],
  state:         { type: String, default: "GREETING" },
  leadData:      { type: leadDataSchema, default: () => ({}) },
  leadScore:     { type: Number, default: 0 },
  lastActivity:  { type: Number, default: Date.now },
  consentGiven:  { type: Boolean, default: false },
  metadata:      { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

// Index for cleanup queries
sessionSchema.index({ lastActivity: 1 });

export default mongoose.model("Session", sessionSchema);

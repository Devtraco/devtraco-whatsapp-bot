import mongoose from "mongoose";

const viewingSchema = new mongoose.Schema({
  viewingId:     { type: String, required: true, unique: true, index: true },
  userId:        { type: String, required: true, index: true },
  propertyId:    String,
  propertyName:  { type: String, default: "Not specified" },
  preferredDate: { type: String, default: "To be confirmed" },
  preferredTime: { type: String, default: "To be confirmed" },
  name:          { type: String, default: "Not provided" },
  phone:         { type: String, required: true },
  email:         { type: String, default: "Not provided" },
  notes:         { type: String, default: "" },
  status:        { type: String, enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"], default: "PENDING" },
}, {
  timestamps: true,
});

export default mongoose.model("Viewing", viewingSchema);

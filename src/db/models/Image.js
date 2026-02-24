import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    // Unique identifier
    imageId: { type: String, required: true, unique: true },

    // Which property this image belongs to
    propertyId: { type: String, required: true, index: true },

    // Original filename
    filename: { type: String, default: "" },

    // MIME type (image/jpeg, image/png, etc.)
    contentType: { type: String, required: true },

    // Image binary data stored as Buffer
    data: { type: Buffer, required: true },

    // File size in bytes
    size: { type: Number, default: 0 },

    // Optional caption / alt text
    caption: { type: String, default: "" },

    // Sort order for multiple images per property
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Image = mongoose.model("Image", imageSchema);
export default Image;

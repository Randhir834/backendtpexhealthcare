import mongoose from "mongoose";

const doctorRatingSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
  },
  {
    timestamps: true,
  }
);

doctorRatingSchema.index({ doctorId: 1, userId: 1, createdAt: -1 });

doctorRatingSchema.index({ doctorId: 1, createdAt: -1 });

doctorRatingSchema.index({ userId: 1, createdAt: -1 });

const DoctorRating =
  mongoose.models.DoctorRating ||
  mongoose.model("DoctorRating", doctorRatingSchema);

export default DoctorRating;

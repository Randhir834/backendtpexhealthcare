/**
 * tpex-healthcare-backend\src\models\doctor.model.js
 *
 * Auto-generated documentation comments.
 */
import mongoose from "mongoose";

const documentRefSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    contentType: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const doctorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    specialty: {
      type: String,
      trim: true,
      index: true,
      default: "",
    },
    consultationFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    adminRating: {
      type: Number,
      default: null,
      min: 1,
      max: 5,
    },
    qualification: {
      highestDegree: { type: String, required: true, trim: true },
      instituteName: { type: String, required: true, trim: true },
      yearOfPassing: { type: Number, required: true },
    },
    clinicAddress: {
      clinicAddress: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      pinCode: { type: String, required: true, trim: true },
    },
    identity: {
      aadharNumber: { type: String, required: true, trim: true, unique: true },
      aadharFrontFileName: { type: String, required: true, trim: true },
      aadharFront: { type: documentRefSchema, required: true },
      aadharBackFileName: { type: String, required: true, trim: true },
      aadharBack: { type: documentRefSchema, required: true },
      secondaryIdType: {
        type: String,
        required: true,
        enum: ["Pan Card", "Driving License", "Voter ID"],
      },
      secondaryIdNumber: { type: String, required: true, trim: true },
      secondaryIdFileName: { type: String, required: true, trim: true },
      secondaryId: { type: documentRefSchema, required: true },
    },
    experience: {
      councilName: { type: String, required: true, trim: true },
      registrationNumber: { type: String, required: true, trim: true, unique: true },
      registrationYear: { type: Number, required: true },
      totalExperience: { type: Number, required: true },
      doctorRegistrationCertificateFileName: { type: String, required: true, trim: true },
      doctorRegistrationCertificate: { type: documentRefSchema, required: true },
    },
    timing: {
      setTimeForAllDays: { type: Boolean, default: true },
      sessionOneEnabled: { type: Boolean, default: true },
      sessionOneFrom: { type: String, default: null },
      sessionOneTo: { type: String, default: null },
      sessionTwoEnabled: { type: Boolean, default: true },
      sessionTwoFrom: { type: String, default: null },
      sessionTwoTo: { type: String, default: null },
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedByEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Doctor = mongoose.models.Doctor || mongoose.model("Doctor", doctorSchema);

export default Doctor;

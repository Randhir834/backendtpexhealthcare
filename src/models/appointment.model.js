 /**
  * Appointment data model.
  *
  * Stores patient-doctor appointments with:
  * - a normalized `dateKey` (YYYY-MM-DD) derived from `dateTime`
  * - a unique constraint per doctor + dateKey + timeSlot (excluding cancelled)
  */
 import mongoose from "mongoose";

 /**
  * Convert a Date (or date-like value) into a YYYY-MM-DD string.
  *
  * @param {Date|string|number} dateTime - Value convertible to a Date.
  * @returns {string} Date key in YYYY-MM-DD format, or empty string if invalid.
  */
 /**
  * toDateKey.
  */
 /**
  * toDateKey.
  */
 /**
  * toDateKey.
  */
 function toDateKey(dateTime) {
  const d = dateTime instanceof Date ? dateTime : new Date(dateTime);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

 /**
  * Mongoose schema for appointments.
  */
 const appointmentSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    dateKey: {
      type: String,
      trim: true,
      index: true,
      default: function () {
        return toDateKey(this.dateTime);
      },
    },
    dateTime: {
      type: Date,
      required: true,
      index: true,
    },
    timeSlot: {
      type: String,
      required: true,
      trim: true,
    },
    slotBookingNumber: {
      type: Number,
      min: 1,
      max: 1,
      default: 1,
      index: true,
    },
    consultationType: {
      type: String,
      required: true,
      enum: ["in_clinic", "online_video", "online_chat"],
      default: "in_clinic",
    },
    patientName: {
      type: String,
      required: true,
      trim: true,
    },
    patientRelation: {
      type: String,
      required: true,
      trim: true,
      default: "self",
    },
    patientGender: {
      type: String,
      trim: true,
      enum: ["male", "female", "other"],
    },
    patientAge: {
      type: Number,
      min: 0,
    },
    patientContactEmail: {
      type: String,
      default: "",
      trim: true,
    },
    patientContactPhone: {
      type: String,
      default: "",
      trim: true,
    },
    fee: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
      index: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    cancellationReason: {
      type: String,
      default: "",
      trim: true,
    },
    paymentMethod: {
      type: String,
      default: "",
      trim: true,
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ["paid", "pending", "failed"],
      default: "pending",
    },
    transactionId: {
      type: String,
      default: "",
      trim: true,
    },
    razorpayOrderId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    razorpaySignature: {
      type: String,
      default: "",
      trim: true,
    },
    rescheduleCount: {
      type: Number,
      min: 0,
      default: 0,
      index: true,
    },
    rescheduledAt: {
      type: Date,
      default: null,
      index: true,
    },
    reminderEmailSentAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

appointmentSchema.index({ doctorId: 1, dateTime: -1 });
appointmentSchema.index({ patientId: 1, dateTime: -1 });
appointmentSchema.index(
  { doctorId: 1, dateKey: 1, timeSlot: 1, slotBookingNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $ne: "cancelled" },
      dateKey: { $exists: true },
    },
  }
);

 /**
  * Appointment mongoose model.
  */
 const Appointment = mongoose.models.Appointment || mongoose.model("Appointment", appointmentSchema);

export default Appointment;

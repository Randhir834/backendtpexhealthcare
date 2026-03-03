
import mongoose from "mongoose";
import Appointment from "../models/appointment.model.js";
import Doctor from "../models/doctor.model.js";
import Patient from "../models/patient.model.js";
import {
  createRazorpayOrder,
  getRazorpayKeyId,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from "../services/payment.service.js";

function isValidObjectId(id) {
  return Boolean(id) && mongoose.Types.ObjectId.isValid(String(id));
}

function isPaymentsEnabled() {
  return false;
}

export async function razorpayWebhook(req, res, next) {
  try {
    if (!isPaymentsEnabled()) {
      return res.status(200).json({ success: true });
    }

    const signature = String(req.get("x-razorpay-signature") || "").trim();
    if (!signature) {
      return res.status(400).json({ success: false, message: "Missing webhook signature" });
    }

    const rawBody = req.rawBody ?? req.body;
    const ok = verifyRazorpayWebhookSignature({ rawBody, signature });
    if (!ok) {
      return res.status(400).json({ success: false, message: "Invalid webhook signature" });
    }

    const payload = Buffer.isBuffer(rawBody)
      ? JSON.parse(rawBody.toString("utf8"))
      : typeof rawBody === "string"
        ? JSON.parse(rawBody)
        : req.body;
    const event = String(payload?.event || "").trim();

    const orderId = String(payload?.payload?.payment?.entity?.order_id || "").trim();
    const paymentId = String(payload?.payload?.payment?.entity?.id || "").trim();

    if (!orderId) {
      return res.status(200).json({ success: true });
    }

    const appointment = await Appointment.findOne({ razorpayOrderId: orderId });
    if (!appointment) {
      return res.status(200).json({ success: true });
    }

    if (appointment.paymentStatus === "paid" && appointment.status === "confirmed") {
      return res.status(200).json({ success: true });
    }

    if (event === "payment.captured") {
      appointment.paymentStatus = "paid";
      appointment.paymentMethod = "razorpay";
      appointment.transactionId = paymentId || appointment.transactionId;
      appointment.razorpayPaymentId = paymentId || appointment.razorpayPaymentId;
      appointment.status = "confirmed";
      await appointment.save();
      return res.status(200).json({ success: true });
    }

    if (event === "payment.failed") {
      if (appointment.paymentStatus !== "paid") {
        appointment.paymentStatus = "failed";
        appointment.status = "cancelled";
        appointment.razorpayPaymentId = paymentId || appointment.razorpayPaymentId;
        await appointment.save();
      }
      return res.status(200).json({ success: true });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

export async function failRazorpayPaymentForAppointment(req, res, next) {
  try {
    if (!isPaymentsEnabled()) {
      return res.status(200).json({ success: true });
    }

    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const patient = await Patient.findOne({ userId }).select({ _id: 1 }).lean();
    if (!patient) {
      return res.status(403).json({ success: false, message: "Only patients can update payment status" });
    }

    const appointmentId = String(req.params?.appointmentId || "").trim();
    if (!isValidObjectId(appointmentId)) {
      return res.status(400).json({ success: false, message: "Valid appointmentId is required" });
    }

    const appointment = await Appointment.findOne({ _id: appointmentId, patientId: patient._id });
    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (appointment.paymentStatus === "paid") {
      return res.status(409).json({ success: false, message: "Paid appointment cannot be marked failed" });
    }

    appointment.paymentStatus = "failed";
    appointment.status = "cancelled";
    await appointment.save();

    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

function mapDoctorToPublic(doctorDoc, { baseUrl } = {}) {
  const d = doctorDoc || {};
  const qualification = d.qualification || {};
  const clinicAddress = d.clinicAddress || {};
  const experience = d.experience || {};
  const timing = d.timing || {};
  const isAvailable = Boolean(timing.sessionOneEnabled || timing.sessionTwoEnabled);
  const yearsOfExperience = Number(experience.totalExperience || 0);

  const id = d?._id?.toString?.() ?? "";

  return {
    id,
    fullName: d?.fullName ?? "",
    specialty: d?.specialty ?? "",
    highestDegree: qualification?.highestDegree ?? "",
    instituteName: qualification?.instituteName ?? "",
    city: clinicAddress?.city ?? "",
    state: clinicAddress?.state ?? "",
    yearsOfExperience,
    isAvailable,
    isOnline: d?.isOnline === true,
    consultationFee: Number(d?.consultationFee || 0),
    photoUrl: baseUrl && id ? `${baseUrl}/doctors/${id}/profile-photo` : "",
  };
}

export async function createRazorpayOrderForAppointment(req, res, next) {
  try {
    if (!isPaymentsEnabled()) {
      return res.status(503).json({ success: false, message: "Payments are disabled" });
    }

    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const patient = await Patient.findOne({ userId }).select({ _id: 1 }).lean();
    if (!patient) {
      return res.status(403).json({ success: false, message: "Only patients can initiate payments" });
    }

    const appointmentId = String(req.params?.appointmentId || "").trim();
    if (!isValidObjectId(appointmentId)) {
      return res.status(400).json({ success: false, message: "Valid appointmentId is required" });
    }

    const appointment = await Appointment.findOne({ _id: appointmentId, patientId: patient._id });
    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (appointment.status === "cancelled") {
      return res.status(409).json({ success: false, message: "Cancelled appointment cannot be paid" });
    }
    if (appointment.status === "completed") {
      return res.status(409).json({ success: false, message: "Completed appointment cannot be paid" });
    }
    if (appointment.paymentStatus === "paid") {
      return res.status(409).json({ success: false, message: "Appointment is already paid" });
    }

    if (appointment.razorpayOrderId && String(appointment.razorpayOrderId).trim()) {
      return res.status(200).json({
        success: true,
        keyId: getRazorpayKeyId(),
        order: {
          id: String(appointment.razorpayOrderId).trim(),
          amount: Math.round(Number(appointment.fee || 0) * 100),
          currency: "INR",
        },
      });
    }

    const amountInPaise = Math.round(Number(appointment.fee || 0) * 100);
    if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
      return res.status(400).json({ success: false, message: "Appointment fee is invalid" });
    }

    const order = await createRazorpayOrder({
      amountInPaise,
      receipt: `appointment_${appointment._id.toString()}`,
      notes: {
        appointmentId: appointment._id.toString(),
        doctorId: appointment.doctorId?.toString?.() ?? "",
      },
    });

    appointment.razorpayOrderId = String(order.id || "");
    await appointment.save();

    return res.status(200).json({
      success: true,
      keyId: getRazorpayKeyId(),
      order: {
        id: String(order.id || ""),
        amount: Number(order.amount || amountInPaise),
        currency: String(order.currency || "INR"),
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function verifyRazorpayPaymentForAppointment(req, res, next) {
  try {
    if (!isPaymentsEnabled()) {
      return res.status(503).json({ success: false, message: "Payments are disabled" });
    }

    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const patient = await Patient.findOne({ userId }).select({ _id: 1 }).lean();
    if (!patient) {
      return res.status(403).json({ success: false, message: "Only patients can verify payments" });
    }

    const appointmentId = String(req.params?.appointmentId || "").trim();
    if (!isValidObjectId(appointmentId)) {
      return res.status(400).json({ success: false, message: "Valid appointmentId is required" });
    }

    const appointment = await Appointment.findOne({ _id: appointmentId, patientId: patient._id });
    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (appointment.status === "cancelled") {
      return res.status(409).json({ success: false, message: "Cancelled appointment cannot be paid" });
    }
    if (appointment.status === "completed") {
      return res.status(409).json({ success: false, message: "Completed appointment cannot be paid" });
    }

    const orderId = String(req.body?.razorpay_order_id || req.body?.razorpayOrderId || "").trim();
    const paymentId = String(req.body?.razorpay_payment_id || req.body?.razorpayPaymentId || "").trim();
    const signature = String(req.body?.razorpay_signature || req.body?.razorpaySignature || "").trim();

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ success: false, message: "razorpay_order_id, razorpay_payment_id and razorpay_signature are required" });
    }

    if (!appointment.razorpayOrderId || String(appointment.razorpayOrderId).trim() !== orderId) {
      return res.status(400).json({ success: false, message: "Order id does not match appointment" });
    }

    const ok = verifyRazorpaySignature({ orderId, paymentId, signature });
    if (!ok) {
      appointment.paymentStatus = "failed";
      appointment.razorpayPaymentId = paymentId;
      appointment.razorpaySignature = signature;
      await appointment.save();
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    appointment.paymentStatus = "paid";
    appointment.paymentMethod = "razorpay";
    appointment.transactionId = paymentId;
    appointment.razorpayPaymentId = paymentId;
    appointment.razorpaySignature = signature;
    appointment.status = "confirmed";
    await appointment.save();

    const doctor = await Doctor.findById(appointment.doctorId)
      .select("fullName qualification clinicAddress experience timing approvalStatus isOnline consultationFee specialty")
      .lean();

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    return res.status(200).json({
      success: true,
      appointment: {
        id: appointment._id.toString(),
        doctor: mapDoctorToPublic(doctor, { baseUrl }),
        dateTime: appointment.dateTime ? appointment.dateTime.toISOString() : null,
        timeSlot: appointment.timeSlot,
        consultationType: appointment.consultationType,
        patientName: appointment.patientName,
        patientRelation: appointment.patientRelation,
        patientGender: appointment.patientGender ?? null,
        patientAge: appointment.patientAge ?? null,
        patientContactEmail: appointment.patientContactEmail || "",
        patientContactPhone: appointment.patientContactPhone || "",
        fee: appointment.fee,
        status: appointment.status,
        paymentMethod: appointment.paymentMethod || "",
        paymentStatus: appointment.paymentStatus,
        transactionId: appointment.transactionId || "",
        createdAt: appointment.createdAt ? appointment.createdAt.toISOString() : null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

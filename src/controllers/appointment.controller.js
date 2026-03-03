 // appointment.controller.js
 //
 // Appointment controller.
 //
 // Responsibilities:
 // - Create appointments (patient)
 // - List appointments for current patient/doctor
 // - Cancel/reschedule appointments (patient)
 // - Provide available slots for a doctor/date
 // - Provide admin views of appointment data
 //

import mongoose from "mongoose";
import Appointment from "../models/appointment.model.js";
import ChatConversation from "../models/chatConversation.model.js";
import Doctor from "../models/doctor.model.js";
import Patient from "../models/patient.model.js";
import User from "../models/user.model.js";
import { getFileInfo, openDownloadStream } from "../services/gridfs.service.js";
import { sendPushToExternalUserIds } from "../services/notification.service.js";
import { sendAppointmentConfirmationEmail, sendAppointmentRescheduledEmail } from "../services/email.service.js";

// Helper function to check if a string is a valid MongoDB ObjectId.
function isValidObjectId(id) {
  return Boolean(id) && mongoose.Types.ObjectId.isValid(String(id));
}

function parseTimeSlotToTimeOfDay(value) {
  const v = String(value || "").trim();
  if (!v) return null;

  const twelve = /^([0-9]{1,2}):([0-9]{2})\s*([AaPp][Mm])$/.exec(v);
  if (twelve) {
    let hh = Number(twelve[1]);
    const mm = Number(twelve[2]);
    const ap = String(twelve[3] || "").toUpperCase();
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
    if (hh === 12) hh = 0;
    if (ap === "PM") hh += 12;
    return { hour: hh, minute: mm };
  }

  const twentyFour = /^([0-9]{1,2}):([0-9]{2})$/.exec(v);
  if (twentyFour) {
    const hh = Number(twentyFour[1]);
    const mm = Number(twentyFour[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return { hour: hh, minute: mm };
  }

  return null;
}

function combineDateAndTimeSlot(dateTime, timeSlot) {
  const t = parseTimeSlotToTimeOfDay(timeSlot);
  if (!t) return null;

  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(t.hour, t.minute, 0, 0);
  return d;
}

function userRoom({ role, profileId }) {
  return `user:${role}:${profileId}`;
}

function mapAppointmentToDoctorPayload(appointmentDoc) {
  const a = appointmentDoc || {};
  const patient = a.patientId || {};
  return {
    id: a._id?.toString?.() ?? "",
    patient: {
      id: patient._id?.toString?.() ?? "",
      fullName: patient.fullName ?? "",
      email: patient.email ?? "",
      phone: patient.phone ?? "",
    },
    patientName: a.patientName ?? "Self",
    patientRelation: a.patientRelation ?? "self",
    patientGender: a.patientGender ?? null,
    patientAge: a.patientAge ?? null,
    patientContactEmail: a.patientContactEmail || "",
    patientContactPhone: a.patientContactPhone || "",
    dateTime: a.dateTime ? new Date(a.dateTime).toISOString() : null,
    timeSlot: a.timeSlot ?? "",
    status: a.status ?? "pending",
    fee: a.fee ?? 0,
    consultationType: a.consultationType ?? "in_clinic",
    paymentMethod: a.paymentMethod ?? "",
    paymentStatus: a.paymentStatus ?? "pending",
    transactionId: a.transactionId ?? "",
    rescheduleCount: Number(a.rescheduleCount || 0),
    rescheduledAt: a.rescheduledAt ? new Date(a.rescheduledAt).toISOString() : null,
    createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
  };
}

function emitAppointmentChanged({ req, doctorProfileId, action, appointmentId, appointment }) {
  const io = req.app?.get?.("io");
  if (!io) return;
  const pid = String(doctorProfileId || "").trim();
  if (!pid) return;

  io.to(userRoom({ role: "doctor", profileId: pid })).emit("appointment:changed", {
    success: true,
    action: String(action || "changed"),
    appointmentId: String(appointmentId || ""),
    appointment: appointment || null,
  });
}

// Fetch a single appointment by id for the currently logged-in patient/doctor.
export async function getMyAppointmentById(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const patient = await Patient.findOne({ userId }).select({ _id: 1 }).lean();
    const doctor = patient
      ? null
      : await Doctor.findOne({ userId }).select({ _id: 1 }).lean();
    if (!patient && !doctor) {
      return res.status(403).json({ success: false, message: "Only patients or doctors can view appointments" });
    }

    const appointmentId = String(req.params?.id || "").trim();
    if (!isValidObjectId(appointmentId)) {
      return res.status(400).json({ success: false, message: "Valid appointment id is required" });
    }

    const query = patient
      ? { _id: appointmentId, patientId: patient._id }
      : { _id: appointmentId, doctorId: doctor._id };

    const appointment = await Appointment.findOne(query).populate("doctorId").lean();
    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const doctorDoc = appointment.doctorId || {};

    return res.status(200).json({
      success: true,
      appointment: {
        id: appointment._id?.toString?.() ?? "",
        doctor: mapDoctorToPublic(doctorDoc, { baseUrl }),
        dateTime: appointment.dateTime ? new Date(appointment.dateTime).toISOString() : null,
        timeSlot: appointment.timeSlot ?? "",
        consultationType: appointment.consultationType ?? "in_clinic",
        patientName: appointment.patientName ?? "Self",
        patientRelation: appointment.patientRelation ?? "self",
        patientGender: appointment.patientGender ?? null,
        patientAge: appointment.patientAge ?? null,
        patientContactEmail: appointment.patientContactEmail || "",
        patientContactPhone: appointment.patientContactPhone || "",
        fee: appointment.fee ?? 0,
        status: appointment.status ?? "pending",
        paymentMethod: appointment.paymentMethod ?? "",
        paymentStatus: appointment.paymentStatus ?? "pending",
        transactionId: appointment.transactionId ?? "",
        rescheduleCount: Number(appointment.rescheduleCount || 0),
        rescheduledAt: appointment.rescheduledAt ? new Date(appointment.rescheduledAt).toISOString() : null,
        createdAt: appointment.createdAt ? new Date(appointment.createdAt).toISOString() : null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// Helper function to parse any ISO date/time (or Date-like value) into a Date.
function parseDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// Helper function to check if a string is a valid date key (YYYY-MM-DD).
function isValidDateKey(dateKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || "").trim());
}

// Helper function to convert a Date into YYYY-MM-DD (UTC) for grouping appointments by day.
function toDateKey(dateTime) {
  const d = dateTime instanceof Date ? dateTime : new Date(dateTime);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// Helper function to parse HH:mm into minutes since midnight.
function parseHHmm(value) {
  const v = String(value || "").trim();

  // Preferred format stored by backend: "HH:mm" (24-hour).
  // However, some older records/clients may have stored "hh:mm AM/PM".
  let m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  m = v.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (m) {
    let hh = Number(m[1]);
    const mm = Number(m[2]);
    const ampm = String(m[3] || "").toUpperCase();
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;

    if (hh === 12) hh = 0;
    if (ampm === "PM") hh += 12;

    return hh * 60 + mm;
  }

  return null;
}

// Helper function to convert minutes-since-midnight into a user-friendly 12-hour slot label.
function formatSlot(minutesFromMidnight) {
  const total = Number(minutesFromMidnight);
  if (!Number.isFinite(total) || total < 0) return "";
  const hh24 = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const ampm = hh24 >= 12 ? "PM" : "AM";
  let hh12 = hh24 % 12;
  if (hh12 === 0) hh12 = 12;
  const hhStr = String(hh12).padStart(2, "0");
  const mmStr = String(mm).padStart(2, "0");
  return `${hhStr}:${mmStr} ${ampm}`;
}

// Helper function to generate slot labels from [from, to) stepping by stepMinutes.
function buildSlotsForRange(fromHHmm, toHHmm, stepMinutes) {
  const from = parseHHmm(fromHHmm);
  const to = parseHHmm(toHHmm);
  const step = Number(stepMinutes);
  if (from == null || to == null) return [];
  if (!Number.isFinite(step) || step <= 0) return [];
  if (to <= from) return [];
  const out = [];
  for (let t = from; t < to; t += step) {
    out.push(formatSlot(t));
  }
  return out.filter((s) => Boolean(s));
}

// Helper function to build a unique list of slots from a doctor's timing settings.
function buildSlotsFromDoctorTiming(timing) {
  const t = timing || {};
  const stepMinutes = 15;
  const slots = [];

  if (t.sessionOneEnabled) {
    slots.push(...buildSlotsForRange(t.sessionOneFrom, t.sessionOneTo, stepMinutes));
  }
  if (t.sessionTwoEnabled) {
    slots.push(...buildSlotsForRange(t.sessionTwoFrom, t.sessionTwoTo, stepMinutes));
  }

  return Array.from(new Set(slots));
}

// Helper function to compute a [startOfDay, startOfNextDay) range for querying.
function dayRange(dateTime) {
  const start = new Date(dateTime);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function pickNextSlotBookingNumber(existingRows) {
  const used = new Set(
    (existingRows || [])
      .map((r) => Number(r?.slotBookingNumber))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 3)
  );

  for (let n = 1; n <= 3; n += 1) {
    if (!used.has(n)) return n;
  }
  return null;
}

// Helper function to convert a full Doctor document into a minimal public shape for appointment responses.
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

// Create an appointment for the currently logged-in patient.
// authMiddleware sets req.user (userId/email).
export async function createAppointment(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const patient = await Patient.findOne({ userId }).select({ _id: 1, fullName: 1, email: 1 }).lean();
    if (!patient) {
      return res.status(403).json({ success: false, message: "Only patients can book appointments" });
    }

    const doctorId = String(req.body?.doctorId || "").trim();
    const dateTimeParsed = parseDateTime(req.body?.dateTime);
    const timeSlot = String(req.body?.timeSlot || "").trim();
    const consultationType = String(req.body?.consultationType || "in_clinic").trim();
    const patientName = String(req.body?.patientName || "Self").trim() || "Self";
    const patientRelation = String(req.body?.patientRelation || "self").trim() || "self";
    const patientGender = req.body?.patientGender ?? null;
    const patientAge = req.body?.patientAge ?? null;
    const patientContactEmail = String(req.body?.patientContactEmail || "").trim();
    const patientContactPhone = String(req.body?.patientContactPhone || "").trim();
    const notes = String(req.body?.notes || "").trim();
    const paymentStatus = String(req.body?.paymentStatus || "pending").trim();
    const paymentMethod = "";
    const transactionId = "";

    if (!isValidObjectId(doctorId)) {
      return res.status(400).json({ success: false, message: "Valid doctorId is required" });
    }
    if (!dateTimeParsed) {
      return res.status(400).json({ success: false, message: "Valid dateTime is required" });
    }
    if (!timeSlot) {
      return res.status(400).json({ success: false, message: "timeSlot is required" });
    }

    const doctor = await Doctor.findById(doctorId)
      .select("userId fullName qualification clinicAddress experience timing approvalStatus isOnline consultationFee")
      .lean();
    if (!doctor || doctor.approvalStatus !== "approved") {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    if (doctor?.isOnline !== true) {
      return res.status(409).json({ success: false, message: "Doctor is offline" });
    }

    const fee = Number(doctor?.consultationFee || 0);
    if (!Number.isFinite(fee) || fee < 0) {
      return res.status(400).json({ success: false, message: "Doctor fee is invalid" });
    }

    const paymentsEnabled = false;

    if (paymentStatus && paymentStatus !== "pending") {
      return res.status(400).json({ success: false, message: "paymentStatus must be pending" });
    }

    const allowedTypes = new Set(["in_clinic", "online_video", "online_chat"]);
    if (!allowedTypes.has(consultationType)) {
      return res.status(400).json({ success: false, message: "Valid consultationType is required" });
    }

    const possibleSlots = buildSlotsFromDoctorTiming(doctor.timing);
    if (!possibleSlots.includes(timeSlot)) {
      return res.status(400).json({ success: false, message: "Selected timeSlot is not available for this doctor" });
    }

    const appointmentStart = combineDateAndTimeSlot(dateTimeParsed, timeSlot);
    if (!appointmentStart) {
      return res.status(400).json({ success: false, message: "Invalid timeSlot" });
    }

    const now = new Date();
    const diffMs = appointmentStart.getTime() - now.getTime();
    if (diffMs < 0) {
      return res.status(400).json({ success: false, message: "Past time slots cannot be booked" });
    }
    if (diffMs < 2 * 60 * 60 * 1000) {
      return res
        .status(400)
        .json({ success: false, message: "Appointments must be booked at least 2 hours in advance" });
    }

    const { start, end } = dayRange(dateTimeParsed);
    const dateKey = toDateKey(dateTimeParsed);

    // Enforce per-doctor, per-day booking limits:
    // - Self bookings: max 1/day
    // - Family bookings: max 10/day
    const relation = String(patientRelation || "self").trim().toLowerCase();
    const isSelfBooking = relation === "self";
    const maxPerDayForDoctor = isSelfBooking ? 1 : 10;
    const existingDailyCount = await Appointment.countDocuments({
      patientId: patient._id,
      doctorId,
      status: { $ne: "cancelled" },
      ...(isSelfBooking
        ? { patientRelation: "self" }
        : { patientRelation: { $ne: "self" } }),
      $or: [{ dateKey }, { dateTime: { $gte: start, $lt: end } }],
    });

    if (existingDailyCount >= maxPerDayForDoctor) {
      return res.status(409).json({
        success: false,
        message: isSelfBooking
          ? "You can only book 1 appointment per day with this doctor"
          : "You can only book up to 10 family appointments per day with this doctor",
      });
    }

    const alreadyBooked = await Appointment.exists({
      doctorId,
      timeSlot,
      status: { $ne: "cancelled" },
      $or: [{ dateKey }, { dateTime: { $gte: start, $lt: end } }],
    });
    if (alreadyBooked) {
      return res.status(409).json({ success: false, message: "This slot is already booked" });
    }

    const appointment = new Appointment({
      patientId: patient._id,
      doctorId,
      dateKey,
      dateTime: dateTimeParsed,
      timeSlot,
      slotBookingNumber: 1,
      consultationType,
      patientName,
      patientRelation,
      patientGender,
      patientAge,
      patientContactEmail,
      patientContactPhone,
      fee,
      status: paymentsEnabled ? "pending" : "confirmed",
      notes,
      paymentStatus,
      paymentMethod,
      transactionId,
    });

    try {
      await appointment.save();
    } catch (e) {
      if (e && (e.code === 11000 || e?.name === "MongoServerError")) {
        return res.status(409).json({ success: false, message: "This slot is already booked" });
      }
      throw e;
    }

    try {
      const to = String(patient?.email || "").trim().toLowerCase();
      if (to) {
        const ca = doctor?.clinicAddress || {};
        const location = [ca.clinicAddress, ca.city, ca.state, ca.pinCode].filter(Boolean).join(", ");

        sendAppointmentConfirmationEmail({
          to,
          patientName: patient?.fullName || "",
          doctorName: doctor?.fullName || "",
          dateTime: appointment?.dateTime,
          timeSlot: appointment?.timeSlot || "",
          consultationType: appointment?.consultationType || "in_clinic",
          location,
          fee: appointment?.fee,
          appointmentId: appointment?._id?.toString?.() || "",
        }).catch((err) => {
          console.error("Failed to send appointment confirmation email:", err?.message || err);
        });
      }
    } catch (_) {
      // Best-effort.
    }

    try {
      const onlineTypes = new Set(["online_chat", "online_video"]);
      if (onlineTypes.has(consultationType)) {
        await ChatConversation.findOneAndUpdate(
          { doctorId, patientId: patient._id },
          { $setOnInsert: { doctorId, patientId: patient._id } },
          { upsert: true, new: false }
        );
      }
    } catch (_) {
      // Best-effort.
    }

    try {
      const doctorUserId = doctor?.userId ? String(doctor.userId) : "";
      if (doctorUserId) {
        await sendPushToExternalUserIds({
          externalUserIds: [doctorUserId],
          title: "New appointment booked",
          body: `${patientName} booked ${timeSlot}`,
          data: {
            type: "appointment_booked",
            appointmentId: appointment._id.toString(),
            doctorId: String(doctorId),
          },
        });
      }
    } catch (_) {
      // Best-effort.
    }

    try {
      const doctorAppointment = await Appointment.findById(appointment._id)
        .populate("patientId", "fullName email phone")
        .lean();

      emitAppointmentChanged({
        req,
        doctorProfileId: doctorId,
        action: "created",
        appointmentId: appointment._id.toString(),
        appointment: mapAppointmentToDoctorPayload(doctorAppointment),
      });
    } catch (_) {
      // Best-effort.
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return res.status(201).json({
      success: true,
      appointment: {
        id: appointment._id.toString(),
        doctor: mapDoctorToPublic(doctor, { baseUrl }),
        dateTime: appointment.dateTime.toISOString(),
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
        rescheduleCount: Number(appointment.rescheduleCount || 0),
        rescheduledAt: appointment.rescheduledAt ? new Date(appointment.rescheduledAt).toISOString() : null,
        createdAt: appointment.createdAt ? appointment.createdAt.toISOString() : null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// Public endpoint for slot availability.
export async function getAvailableSlots(req, res, next) {
  try {
    const doctorId = String(req.query?.doctorId || "").trim();
    const dateKey = String(req.query?.date || "").trim();

    if (!isValidObjectId(doctorId)) {
      return res.status(400).json({ success: false, message: "Valid doctorId is required" });
    }

    if (!isValidDateKey(dateKey)) {
      return res.status(400).json({ success: false, message: "Valid date (YYYY-MM-DD) is required" });
    }

    const doctor = await Doctor.findById(doctorId).select("timing approvalStatus").lean();
    if (!doctor || doctor.approvalStatus !== "approved") {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const allSlots = buildSlotsFromDoctorTiming(doctor.timing);

    // Prefer matching by dateKey (stable), but also fallback to a UTC range so
    // older records without dateKey still block the correct slots.
    const start = new Date(`${dateKey}T00:00:00.000Z`);
    const end = new Date(`${dateKey}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);

    const booked = await Appointment.find({
      doctorId,
      status: { $ne: "cancelled" },
      $or: [{ dateKey }, { dateTime: { $gte: start, $lt: end } }],
    })
      .select({ timeSlot: 1 })
      .lean();

    const bookedSet = new Set(
      (booked || [])
        .map((a) => String(a?.timeSlot || "").trim())
        .filter((s) => Boolean(s))
    );

    const now = new Date();
    const dayStartLocal = new Date(`${dateKey}T00:00:00`);
    const slots = allSlots
      .filter((s) => !bookedSet.has(s))
      .filter((s) => {
        const start = combineDateAndTimeSlot(dayStartLocal, s);
        if (!start) return false;
        const diffMs = start.getTime() - now.getTime();
        return diffMs >= 2 * 60 * 60 * 1000;
      });

    return res.status(200).json({ success: true, slots });
  } catch (err) {
    return next(err);
  }
}

// List appointments for the currently logged-in patient.
export async function getMyPatientAppointments(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const patient = await Patient.findOne({ userId }).select({ _id: 1 }).lean();
    if (!patient) {
      return res.status(403).json({ success: false, message: "Only patients can view appointments" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const appointments = await Appointment.find({ patientId: patient._id })
      .sort({ dateTime: -1 })
      .populate("doctorId", "fullName qualification clinicAddress experience timing approvalStatus isOnline")
      .lean();

    const mapped = (appointments || []).map((a) => {
      const doctor = a.doctorId || {};
      return {
        id: a._id?.toString?.() ?? "",
        doctor: mapDoctorToPublic(doctor, { baseUrl }),
        dateTime: a.dateTime ? new Date(a.dateTime).toISOString() : null,
        timeSlot: a.timeSlot ?? "",
        consultationType: a.consultationType ?? "in_clinic",
        patientName: a.patientName ?? "Self",
        patientRelation: a.patientRelation ?? "self",
        patientGender: a.patientGender ?? null,
        patientAge: a.patientAge ?? null,
        patientContactEmail: a.patientContactEmail || "",
        patientContactPhone: a.patientContactPhone || "",
        fee: a.fee ?? 0,
        status: a.status ?? "pending",
        paymentMethod: a.paymentMethod ?? "",
        paymentStatus: a.paymentStatus ?? "pending",
        transactionId: a.transactionId ?? "",
        rescheduleCount: Number(a.rescheduleCount || 0),
        rescheduledAt: a.rescheduledAt ? new Date(a.rescheduledAt).toISOString() : null,
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
      };
    });

    return res.status(200).json({ success: true, appointments: mapped });
  } catch (err) {
    return next(err);
  }
}

// List unique patients for the currently logged-in doctor.
export async function getMyDoctorPatients(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doctor = await Doctor.findOne({ userId }).select({ _id: 1 }).lean();
    if (!doctor) {
      return res.status(403).json({ success: false, message: "Only doctors can view patients" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const rows = await Appointment.aggregate([
      { $match: { doctorId: doctor._id } },
      {
        $group: {
          _id: "$patientId",
          appointmentCount: { $sum: 1 },
          lastAppointment: { $max: "$dateTime" },
        },
      },
      {
        $lookup: {
          from: "patients",
          localField: "_id",
          foreignField: "_id",
          as: "patient",
        },
      },
      {
        $unwind: {
          path: "$patient",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          patient: {
            id: { $toString: "$_id" },
            fullName: { $ifNull: ["$patient.fullName", ""] },
            email: { $ifNull: ["$patient.email", ""] },
            phone: { $ifNull: ["$patient.phone", ""] },
            gender: { $ifNull: ["$patient.gender", ""] },
            dob: { $ifNull: ["$patient.dob", null] },
            currentLocation: { $ifNull: ["$patient.currentLocation", ""] },
          },
          appointmentCount: 1,
          lastAppointment: 1,
        },
      },
      { $sort: { lastAppointment: -1 } },
    ]);

    const mapped = (rows || []).map((r) => ({
      patient: {
        id: r?.patient?.id ?? "",
        fullName: r?.patient?.fullName ?? "",
        email: r?.patient?.email ?? "",
        phone: r?.patient?.phone ?? "",
        gender: r?.patient?.gender ?? "",
        dob: r?.patient?.dob ? new Date(r.patient.dob).toISOString() : null,
        currentLocation: r?.patient?.currentLocation ?? "",
        photoUrl: r?.patient?.id ? `${baseUrl}/appointments/doctor/patients/${r.patient.id}/profile-photo` : "",
      },
      appointmentCount: Number(r.appointmentCount || 0),
      lastAppointment: r.lastAppointment ? new Date(r.lastAppointment).toISOString() : null,
    }));

    return res.status(200).json({ success: true, patients: mapped });
  } catch (err) {
    return next(err);
  }
}

// Appointment history for a specific patient of the currently logged-in doctor.
export async function getMyDoctorPatientHistory(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doctor = await Doctor.findOne({ userId }).select({ _id: 1 }).lean();
    if (!doctor) {
      return res.status(403).json({ success: false, message: "Only doctors can view patient history" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const patientId = String(req.params?.patientId || "").trim();
    if (!isValidObjectId(patientId)) {
      return res.status(400).json({ success: false, message: "Valid patientId is required" });
    }

    const patient = await Patient.findById(patientId).select("fullName email phone gender dob currentLocation").lean();
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    const appointments = await Appointment.find({ doctorId: doctor._id, patientId })
      .sort({ dateTime: -1 })
      .lean();

    const mapped = (appointments || []).map((a) => ({
      id: a._id?.toString?.() ?? "",
      dateTime: a.dateTime ? new Date(a.dateTime).toISOString() : null,
      timeSlot: a.timeSlot ?? "",
      status: a.status ?? "pending",
      fee: a.fee ?? 0,
      consultationType: a.consultationType ?? "in_clinic",
      patientName: a.patientName ?? "Self",
      patientRelation: a.patientRelation ?? "self",
      patientGender: a.patientGender ?? null,
      patientAge: a.patientAge ?? null,
      patientContactEmail: a.patientContactEmail || "",
      patientContactPhone: a.patientContactPhone || "",
      notes: a.notes ?? "",
      paymentMethod: a.paymentMethod ?? "",
      paymentStatus: a.paymentStatus ?? "pending",
      transactionId: a.transactionId ?? "",
      rescheduleCount: Number(a.rescheduleCount || 0),
      rescheduledAt: a.rescheduledAt ? new Date(a.rescheduledAt).toISOString() : null,
      createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
    }));

    return res.status(200).json({
      success: true,
      patient: {
        id: patient._id?.toString?.() ?? "",
        fullName: patient.fullName ?? "",
        email: patient.email ?? "",
        phone: patient.phone ?? "",
        gender: patient.gender ?? "",
        dob: patient.dob ? new Date(patient.dob).toISOString() : null,
        currentLocation: patient.currentLocation ?? "",
        photoUrl: patient._id ? `${baseUrl}/appointments/doctor/patients/${patient._id.toString()}/profile-photo` : "",
      },
      appointmentCount: mapped.length,
      appointments: mapped,
    });
  } catch (err) {
    return next(err);
  }
}

// Stream a patient's profile photo for the currently logged-in doctor.
// Allowed only if the doctor has treated (has appointments with) that patient.
export async function getMyDoctorPatientProfilePhoto(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doctor = await Doctor.findOne({ userId }).select({ _id: 1 }).lean();
    if (!doctor) {
      return res.status(403).json({ success: false, message: "Only doctors can view patient photos" });
    }

    const patientId = String(req.params?.patientId || "").trim();
    if (!isValidObjectId(patientId)) {
      return res.status(400).json({ success: false, message: "Valid patientId is required" });
    }

    const hasAppointment = await Appointment.findOne({ doctorId: doctor._id, patientId })
      .select({ _id: 1 })
      .lean();
    if (!hasAppointment) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const patient = await Patient.findById(patientId).select({ userId: 1 }).lean();
    if (!patient?.userId) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    const user = await User.findById(patient.userId).select({ profilePhoto: 1 }).lean();
    const fileId = user?.profilePhoto?.fileId;
    if (!fileId) {
      return res.status(404).json({ success: false, message: "Profile photo not found" });
    }

    const info = await getFileInfo(fileId);
    if (!info) {
      return res.status(404).json({ success: false, message: "Profile photo not found" });
    }

    res.setHeader("Content-Type", info.contentType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=\"${encodeURIComponent(info.filename || "profile-photo")}\"`
    );

    const stream = openDownloadStream(fileId);
    stream.on("error", (err) => next(err));
    return stream.pipe(res);
  } catch (err) {
    return next(err);
  }
}

// List appointments for the currently logged-in doctor.
export async function getMyDoctorAppointments(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doctor = await Doctor.findOne({ userId }).select({ _id: 1 }).lean();
    if (!doctor) {
      return res.status(403).json({ success: false, message: "Only doctors can view appointments" });
    }

    const appointments = await Appointment.find({ doctorId: doctor._id })
      .sort({ dateTime: -1 })
      .populate("patientId", "fullName email phone")
      .lean();

    const mapped = (appointments || []).map((a) => {
      const patient = a.patientId || {};
      return {
        id: a._id?.toString?.() ?? "",
        patient: {
          id: patient._id?.toString?.() ?? "",
          fullName: patient.fullName ?? "",
          email: patient.email ?? "",
          phone: patient.phone ?? "",
        },
        patientName: a.patientName ?? "Self",
        patientRelation: a.patientRelation ?? "self",
        patientGender: a.patientGender ?? null,
        patientAge: a.patientAge ?? null,
        patientContactEmail: a.patientContactEmail || "",
        patientContactPhone: a.patientContactPhone || "",
        dateTime: a.dateTime ? new Date(a.dateTime).toISOString() : null,
        timeSlot: a.timeSlot ?? "",
        status: a.status ?? "pending",
        fee: a.fee ?? 0,
        consultationType: a.consultationType ?? "in_clinic",
        paymentMethod: a.paymentMethod ?? "",
        paymentStatus: a.paymentStatus ?? "pending",
        transactionId: a.transactionId ?? "",
        rescheduleCount: Number(a.rescheduleCount || 0),
        rescheduledAt: a.rescheduledAt ? new Date(a.rescheduledAt).toISOString() : null,
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
      };
    });

    return res.status(200).json({ success: true, appointments: mapped });
  } catch (err) {
    return next(err);
  }
}

// Cancel an appointment owned by the current patient.
export async function cancelMyAppointment(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const patient = await Patient.findOne({ userId }).select({ _id: 1 }).lean();
    const doctor = patient
      ? null
      : await Doctor.findOne({ userId }).select({ _id: 1 }).lean();
    if (!patient && !doctor) {
      return res
        .status(403)
        .json({ success: false, message: "Only patients or doctors can cancel appointments" });
    }

    const appointmentId = String(req.params?.id || "").trim();
    if (!isValidObjectId(appointmentId)) {
      return res.status(400).json({ success: false, message: "Valid appointment id is required" });
    }

    const reason = String(req.body?.reason || "").trim();

    const appointment = await Appointment.findOne(
      patient
        ? { _id: appointmentId, patientId: patient._id }
        : { _id: appointmentId, doctorId: doctor._id }
    );
    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (appointment.status === "cancelled") {
      return res.status(200).json({ success: true });
    }

    if (appointment.status === "completed") {
      return res
        .status(400)
        .json({ success: false, message: "Completed appointment cannot be cancelled" });
    }

    if (!patient) {
      const appointmentDateTime = appointment.dateTime ? new Date(appointment.dateTime) : null;
      if (!appointmentDateTime || Number.isNaN(appointmentDateTime.getTime())) {
        return res
          .status(400)
          .json({ success: false, message: "Appointment date is invalid" });
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      if (appointmentDateTime < startOfToday) {
        return res
          .status(400)
          .json({ success: false, message: "Past appointments cannot be cancelled" });
      }
    }

    appointment.status = "cancelled";
    appointment.cancellationReason = reason;
    await appointment.save();

    try {
      const doctorAppointment = await Appointment.findById(appointment._id)
        .populate("patientId", "fullName email phone")
        .lean();

      emitAppointmentChanged({
        req,
        doctorProfileId: appointment.doctorId?.toString?.() ?? String(appointment.doctorId),
        action: "cancelled",
        appointmentId: appointment._id.toString(),
        appointment: mapAppointmentToDoctorPayload(doctorAppointment),
      });
    } catch (_) {
      // Best-effort.
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

// Admin summary list: for each doctor, show appointmentCount and patientCount.
export async function adminListAppointmentDoctors(req, res, next) {
  try {
    // Aggregate on Appointment so we only return doctors who actually have bookings.
    const rows = await Appointment.aggregate([
      {
        $group: {
          _id: "$doctorId",
          appointmentCount: { $sum: 1 },
          patientIds: { $addToSet: "$patientId" },
        },
      },
      {
        $project: {
          doctorId: "$_id",
          appointmentCount: 1,
          patientCount: { $size: "$patientIds" },
        },
      },
      {
        $lookup: {
          from: "doctors",
          localField: "doctorId",
          foreignField: "_id",
          as: "doctor",
        },
      },
      {
        $unwind: {
          path: "$doctor",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          doctorId: { $toString: "$doctorId" },
          fullName: { $ifNull: ["$doctor.fullName", ""] },
          appointmentCount: 1,
          patientCount: 1,
        },
      },
      { $sort: { appointmentCount: -1, fullName: 1 } },
    ]);

    return res.status(200).json({ success: true, doctors: rows });
  } catch (err) {
    return next(err);
  }
}

// Admin detail view: list appointments for a specific doctor.
export async function adminGetDoctorAppointments(req, res, next) {
  try {
    const doctorId = String(req.params?.doctorId || "").trim();
    if (!isValidObjectId(doctorId)) {
      return res.status(400).json({ success: false, message: "Valid doctorId is required" });
    }

    const appointments = await Appointment.find({ doctorId })
      .sort({ dateTime: -1 })
      .populate("patientId", "fullName email phone")
      .lean();

    const appointmentCount = appointments.length;
    const patientCount = new Set(
      appointments
        .map((a) => a?.patientId?._id?.toString?.())
        .filter((id) => Boolean(id))
    ).size;

    const mapped = appointments.map((a) => {
      const patient = a.patientId || {};
      return {
        id: a._id?.toString?.() ?? "",
        patient: {
          id: patient._id?.toString?.() ?? "",
          fullName: patient.fullName ?? "",
          email: patient.email ?? "",
          phone: patient.phone ?? "",
        },
        patientName: a.patientName ?? "",
        patientRelation: a.patientRelation ?? "",
        patientGender: a.patientGender ?? null,
        patientAge: a.patientAge ?? null,
        patientContactEmail: a.patientContactEmail || "",
        patientContactPhone: a.patientContactPhone || "",
        dateTime: a.dateTime ?? null,
        timeSlot: a.timeSlot ?? "",
        status: a.status ?? "",
        fee: a.fee ?? 0,
        consultationType: a.consultationType ?? "",
        paymentMethod: a.paymentMethod ?? "",
        paymentStatus: a.paymentStatus ?? "",
        transactionId: a.transactionId ?? "",
        createdAt: a.createdAt ?? null,
      };
    });

    return res.status(200).json({
      success: true,
      appointmentCount,
      patientCount,
      appointments: mapped,
    });
  } catch (err) {
    return next(err);
  }
}

// Reschedule an appointment owned by the current patient.
export async function rescheduleMyAppointment(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const patient = await Patient.findOne({ userId }).select({ _id: 1, fullName: 1, email: 1 }).lean();
    if (!patient) {
      return res.status(403).json({ success: false, message: "Only patients can reschedule appointments" });
    }

    const appointmentId = String(req.params?.id || "").trim();
    if (!isValidObjectId(appointmentId)) {
      return res.status(400).json({ success: false, message: "Valid appointment id is required" });
    }

    const newDateTimeParsed = parseDateTime(req.body?.dateTime);
    const newTimeSlot = String(req.body?.timeSlot || "").trim();

    if (!newDateTimeParsed) {
      return res.status(400).json({ success: false, message: "Valid dateTime is required" });
    }
    if (!newTimeSlot) {
      return res.status(400).json({ success: false, message: "timeSlot is required" });
    }

    const now = new Date();
    if (newDateTimeParsed <= now) {
      return res.status(400).json({ success: false, message: "New appointment time must be in the future" });
    }

    const appointment = await Appointment.findOne({ _id: appointmentId, patientId: patient._id });
    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (appointment.status === "cancelled") {
      return res.status(400).json({ success: false, message: "Cancelled appointment cannot be rescheduled" });
    }

    if (appointment.status === "completed") {
      return res.status(400).json({ success: false, message: "Completed appointment cannot be rescheduled" });
    }

    const currentCount = Number(appointment.rescheduleCount || 0);
    if (currentCount >= 1) {
      return res.status(400).json({ success: false, message: "Appointment can only be rescheduled once" });
    }

    const existingStart = appointment.dateTime ? new Date(appointment.dateTime) : null;
    if (!existingStart || Number.isNaN(existingStart.getTime())) {
      return res.status(400).json({ success: false, message: "Appointment date is invalid" });
    }

    if (existingStart <= now) {
      return res.status(400).json({ success: false, message: "Past appointments cannot be rescheduled" });
    }

    const hoursDiff = (existingStart.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursDiff < 24) {
      return res.status(400).json({ success: false, message: "You can only reschedule up to 24 hours before the appointment" });
    }

    const doctor = await Doctor.findById(appointment.doctorId)
      .select("timing approvalStatus fullName clinicAddress consultationFee")
      .lean();
    if (!doctor || doctor.approvalStatus !== "approved") {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const possibleSlots = buildSlotsFromDoctorTiming(doctor.timing);
    if (!possibleSlots.includes(newTimeSlot)) {
      return res.status(400).json({ success: false, message: "Selected timeSlot is not available for this doctor" });
    }

    const { start, end } = dayRange(newDateTimeParsed);
    const dateKey = toDateKey(newDateTimeParsed);

    const alreadyBooked = await Appointment.exists({
      _id: { $ne: appointment._id },
      doctorId: appointment.doctorId,
      timeSlot: newTimeSlot,
      status: { $ne: "cancelled" },
      $or: [{ dateKey }, { dateTime: { $gte: start, $lt: end } }],
    });
    if (alreadyBooked) {
      return res.status(409).json({ success: false, message: "This slot is already booked" });
    }

    try {
      appointment.dateKey = dateKey;
      appointment.dateTime = newDateTimeParsed;
      appointment.timeSlot = newTimeSlot;
      appointment.slotBookingNumber = 1;
      appointment.status = "confirmed";
      appointment.rescheduleCount = currentCount + 1;
      appointment.rescheduledAt = new Date();
      appointment.reminderEmailSentAt = null;
      await appointment.save();
    } catch (e) {
      if (e && (e.code === 11000 || e?.name === "MongoServerError")) {
        return res.status(409).json({ success: false, message: "This slot is already booked" });
      }
      throw e;
    }

    try {
      const to = String(patient?.email || "").trim().toLowerCase();
      if (to) {
        const ca = doctor?.clinicAddress || {};
        const location = [ca.clinicAddress, ca.city, ca.state, ca.pinCode].filter(Boolean).join(", ");

        sendAppointmentRescheduledEmail({
          to,
          patientName: patient?.fullName || "",
          doctorName: doctor?.fullName || "",
          dateTime: appointment?.dateTime,
          timeSlot: appointment?.timeSlot || "",
          consultationType: appointment?.consultationType || "in_clinic",
          location,
          fee: appointment?.fee,
          appointmentId: appointment?._id?.toString?.() || "",
        }).catch((err) => {
          console.error("Failed to send appointment rescheduled email:", err?.message || err);
        });
      }
    } catch (_) {
      // Best-effort.
    }

    try {
      const doctorAppointment = await Appointment.findById(appointment._id)
        .populate("patientId", "fullName email phone")
        .lean();

      emitAppointmentChanged({
        req,
        doctorProfileId: appointment.doctorId?.toString?.() ?? String(appointment.doctorId),
        action: "rescheduled",
        appointmentId: appointment._id.toString(),
        appointment: mapAppointmentToDoctorPayload(doctorAppointment),
      });
    } catch (_) {
      // Best-effort.
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

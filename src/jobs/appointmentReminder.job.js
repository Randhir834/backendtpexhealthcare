import mongoose from "mongoose";
import Appointment from "../models/appointment.model.js";
import { sendAppointmentReminderEmail } from "../services/email.service.js";

function toBool(v, defaultValue = true) {
  if (v == null) return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return defaultValue;
}

export function startAppointmentReminderJob() {
  const enabled = toBool(process.env.APPOINTMENT_REMINDER_ENABLED, true);
  if (!enabled) return;

  const intervalSeconds = Number.parseInt(process.env.APPOINTMENT_REMINDER_INTERVAL_SECONDS || "60", 10);
  const windowMinutes = Number.parseInt(process.env.APPOINTMENT_REMINDER_WINDOW_MINUTES || "2", 10);

  const intervalMs = Math.max(10, Number.isFinite(intervalSeconds) ? intervalSeconds : 60) * 1000;
  const windowMs = Math.max(0, Number.isFinite(windowMinutes) ? windowMinutes : 2) * 60 * 1000;

  const targetMs = 90 * 60 * 1000;

  setInterval(async () => {
    try {
      if (mongoose.connection.readyState !== 1) return;

      const now = new Date();
      const target = new Date(now.getTime() + targetMs);
      const start = new Date(target.getTime() - windowMs);
      const end = new Date(target.getTime() + windowMs);

      const upcoming = await Appointment.find({
        status: "confirmed",
        reminderEmailSentAt: null,
        dateTime: { $gte: start, $lte: end },
      })
        .select({ _id: 1 })
        .lean();

      for (const row of upcoming || []) {
        const id = row?._id;
        if (!id) continue;

        const claimed = await Appointment.findOneAndUpdate(
          { _id: id, reminderEmailSentAt: null },
          { $set: { reminderEmailSentAt: new Date() } },
          { new: true }
        )
          .populate("patientId", "fullName email")
          .populate("doctorId", "fullName clinicAddress")
          .lean();

        if (!claimed) continue;

        try {
          const patient = claimed.patientId || {};
          const doctor = claimed.doctorId || {};
          const to = String(patient.email || "").trim().toLowerCase();
          if (!to) continue;

          const ca = doctor?.clinicAddress || {};
          const location = [ca.clinicAddress, ca.city, ca.state, ca.pinCode].filter(Boolean).join(", ");

          await sendAppointmentReminderEmail({
            to,
            patientName: patient.fullName || "",
            doctorName: doctor.fullName || "",
            dateTime: claimed.dateTime,
            timeSlot: claimed.timeSlot || "",
            consultationType: claimed.consultationType || "in_clinic",
            location,
            fee: claimed.fee,
            appointmentId: claimed._id?.toString?.() || "",
          });
        } catch (err) {
          await Appointment.updateOne({ _id: claimed._id }, { $set: { reminderEmailSentAt: null } }).catch(() => {});
          console.error("Failed to send appointment reminder email:", err?.message || err);
        }
      }
    } catch (err) {
      console.error("Appointment reminder job error:", err?.message || err);
    }
  }, intervalMs);
}

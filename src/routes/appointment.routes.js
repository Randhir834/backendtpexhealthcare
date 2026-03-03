/**
 * tpex-healthcare-backend\src\routes\appointment.routes.js
 *
 * Auto-generated documentation comments.
 */
 import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import {
  cancelMyAppointment,
  createAppointment,
  getAvailableSlots,
  getMyAppointmentById,
  getMyDoctorPatientHistory,
  getMyDoctorPatientProfilePhoto,
  getMyDoctorPatients,
  getMyDoctorAppointments,
  getMyPatientAppointments,
  rescheduleMyAppointment,
} from "../controllers/appointment.controller.js";

// appointment.routes.js
//
// Appointment routes.
//
// Public endpoints:
// - GET /appointments/available-slots -> available slots for a doctor on a date
//
// Authenticated endpoints (require authMiddleware):
// - Patient: create/list/cancel/reschedule own appointments
// - Doctor: list own appointments
const router = Router();

// Public: available slots for a doctor and date
router.get("/available-slots", getAvailableSlots);

// Patient
router.post("/", authMiddleware, createAppointment);
router.get("/me", authMiddleware, getMyPatientAppointments);
router.get("/:id", authMiddleware, getMyAppointmentById);
router.put("/:id/cancel", authMiddleware, cancelMyAppointment);
router.put("/:id/reschedule", authMiddleware, rescheduleMyAppointment);

// Doctor
router.get("/doctor/me", authMiddleware, getMyDoctorAppointments);
router.get("/doctor/patients", authMiddleware, getMyDoctorPatients);
router.get("/doctor/patients/:patientId", authMiddleware, getMyDoctorPatientHistory);
router.get("/doctor/patients/:patientId/profile-photo", authMiddleware, getMyDoctorPatientProfilePhoto);

export default router;

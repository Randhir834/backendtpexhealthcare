/**
 * tpex-healthcare-backend\src\routes\admin.routes.js
 *
 * Auto-generated documentation comments.
 */
import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import adminMiddleware from "../middlewares/admin.middleware.js";
import { doctorRegistrationUpload } from "../middlewares/upload.middleware.js";
import {
  adminGetDoctorAppointments,
  adminListAppointmentDoctors,
} from "../controllers/appointment.controller.js";
import {
  approveDoctor,
  getDoctorProfilePhotoForAdmin,
  getDoctorForApproval,
  getPatientDetails,
  getPatientProfilePhotoForAdmin,
  listPendingDoctors,
  listPatients,
  registerDoctorByAdmin,
  listVerifiedDoctors,
  setDoctorAdminRating,
} from "../controllers/admin.controller.js";
import { addAdmin } from "../controllers/adminManagement.controller.js";

// admin.routes.js
//
// Admin-only routes.
//
// These endpoints require:
// - authMiddleware: user must be logged in
// - adminMiddleware: user must have admin privileges
//
// Features covered:
// - Doctor approval workflow (pending list, details, approve)
// - Patient listing/details (for admin viewing)
// - Admin view of doctor appointments
// - Admin creation (addAdmin)

const router = Router();

router.use(authMiddleware, adminMiddleware);

// Doctor approval workflow
router.get("/doctors/pending", listPendingDoctors);
router.get("/doctors/verified", listVerifiedDoctors);
router.post("/doctors/register", doctorRegistrationUpload, registerDoctorByAdmin);
router.get("/doctors/:id/profile-photo", getDoctorProfilePhotoForAdmin);
router.get("/doctors/:id", getDoctorForApproval);
router.put("/doctors/:id/approve", approveDoctor);
router.put("/doctors/:id/rating", setDoctorAdminRating);

router.get("/patients", listPatients);
router.get("/patients/:id/profile-photo", getPatientProfilePhotoForAdmin);
router.get("/patients/:id", getPatientDetails);

router.get("/appointments/doctors", adminListAppointmentDoctors);
router.get(
  "/appointments/doctors/:doctorId",
  adminGetDoctorAppointments
);

router.post("/admins", addAdmin);

export default router;

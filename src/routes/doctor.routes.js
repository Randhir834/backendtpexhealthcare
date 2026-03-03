/**
 * tpex-healthcare-backend\src\routes\doctor.routes.js
 *
 * Auto-generated documentation comments.
 */
import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import {
  doctorIdentityDocsUpload,
  doctorRegistrationCertificateUpload,
  doctorRegistrationUpload,
} from "../middlewares/upload.middleware.js";
import {
  listDoctors,
  getDoctorProfilePhoto,
  getMyDoctorProfile,
  registerDoctor,
  rateDoctor,
  updateMyOnlineStatus,
  updateMyConsultationFee,
  updateMyDoctorProfile,
  updateMyDoctorIdentityDocuments,
  updateMyDoctorRegistrationCertificate,
} from "../controllers/doctor.controller.js";

// doctor.routes.js
//
// Doctor routes.
//
// Public endpoints:
// - GET /doctors -> list doctors
// - GET /doctors/:doctorId/profile-photo -> fetch a doctor's profile photo
//
// Authenticated endpoints:
// - POST /doctors/register -> register doctor with multipart upload
// - GET/PUT /doctors/me -> view/update the logged-in doctor's profile
// - PUT /doctors/me/registration-certificate -> upload registration certificate
// - PUT /doctors/me/identity-docs -> upload identity docs
//
// Upload middlewares parse multipart files and attach them to req.files.
const router = Router();

router.get("/", listDoctors);
router.get("/:doctorId/profile-photo", getDoctorProfilePhoto);
router.post("/:doctorId/rating", authMiddleware, rateDoctor);
router.post("/register", authMiddleware, doctorRegistrationUpload, registerDoctor);
router.get("/me", authMiddleware, getMyDoctorProfile);
router.put("/me", authMiddleware, updateMyDoctorProfile);
router.put("/me/online-status", authMiddleware, updateMyOnlineStatus);
router.put("/me/consultation-fee", authMiddleware, updateMyConsultationFee);
router.put(
  "/me/registration-certificate",
  authMiddleware,
  doctorRegistrationCertificateUpload,
  updateMyDoctorRegistrationCertificate
);

router.put(
  "/me/identity-docs",
  authMiddleware,
  doctorIdentityDocsUpload,
  updateMyDoctorIdentityDocuments
);

export default router;

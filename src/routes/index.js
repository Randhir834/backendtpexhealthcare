 // routes/index.js
 //
 // Central place where all feature routers are mounted.
 //
 // Each router file groups endpoints for a specific feature area:
 // - auth: login/otp/session
 // - patients: patient profile endpoints
 // - doctors: doctor profile/registration endpoints
 // - files: file upload/download (GridFS)
 // - appointments: booking/cancel/reschedule + lists
 // - admin: admin-only actions (e.g., verify doctors)
 // - users: user profile endpoints
 import { Router } from "express";
 import authRoutes from "./auth.routes.js";
 import patientRoutes from "./patient.routes.js";
 import doctorRoutes from "./doctor.routes.js";
 import fileRoutes from "./file.routes.js";
 import appointmentRoutes from "./appointment.routes.js";
 import paymentRoutes from "./payment.routes.js";
 import adminRoutes from "./admin.routes.js";
 import userRoutes from "./user.routes.js";
 import chatRoutes from "./chat.routes.js";
 import e2eeRoutes from "./e2ee.routes.js";

const router = Router();

// Base paths for each feature router.
router.use("/auth", authRoutes);
router.use("/patients", patientRoutes);
router.use("/doctors", doctorRoutes);
router.use("/files", fileRoutes);
router.use("/appointments", appointmentRoutes);
router.use("/payments", paymentRoutes);
router.use("/admin", adminRoutes);
router.use("/users", userRoutes);
router.use("/chats", chatRoutes);
router.use("/e2ee", e2eeRoutes);

export default router;

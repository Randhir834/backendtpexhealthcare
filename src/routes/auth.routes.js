/**
 * tpex-healthcare-backend\src\routes\auth.routes.js
 *
 * Auto-generated documentation comments.
 */
 import { Router } from "express";
 import { requestOtp, verifyOtp } from "../controllers/auth.controller.js";

 // auth.routes.js
 //
 // Authentication routes.
 // This backend uses an OTP-based login flow:
 // - POST /auth/login -> request OTP for an email
 // - POST /auth/verify-otp -> verify OTP and create a session/token

 const router = Router();

 router.post("/login", requestOtp);
 router.post("/verify-otp", verifyOtp);

 export default router;

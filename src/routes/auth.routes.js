/**
 * tpex-healthcare-backend\src\routes\auth.routes.js
 *
 * Auto-generated documentation comments.
 */
 import { Router } from "express";
 import { loginWithEmail } from "../controllers/auth.controller.js";

 // auth.routes.js
 //
 // Authentication routes.
 // This backend uses an email-only login flow:
 // - POST /auth/login -> login with email

 const router = Router();
 
 router.post("/login", loginWithEmail);
 
 export default router;

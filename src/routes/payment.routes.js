
import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import {
  createRazorpayOrderForAppointment,
  failRazorpayPaymentForAppointment,
  razorpayWebhook,
  verifyRazorpayPaymentForAppointment,
} from "../controllers/payment.controller.js";

const router = Router();

router.post("/appointments/:appointmentId/order", authMiddleware, createRazorpayOrderForAppointment);
router.post("/appointments/:appointmentId/fail", authMiddleware, failRazorpayPaymentForAppointment);
router.post("/appointments/:appointmentId/verify", authMiddleware, verifyRazorpayPaymentForAppointment);

router.post("/webhook/razorpay", razorpayWebhook);

export default router;

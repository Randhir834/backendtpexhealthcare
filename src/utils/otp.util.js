/**
 * tpex-healthcare-backend\src\utils\otp.util.js
 *
 * Auto-generated documentation comments.
 */
 import crypto from "crypto";

 /**
  * generateOtp.
  */
 /**
  * generateOtp.
  */
 /**
  * generateOtp.
  */
 export function generateOtp() {
   const otp = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
   return otp;
 }

 /**
  * hashOtp.
  */
 /**
  * hashOtp.
  */
 export function hashOtp(otp) {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error("OTP_SECRET/JWT_SECRET is not configured");
    err.statusCode = 500;
    throw err;
  }
  return crypto.createHash("sha256").update(`${otp}.${secret}`).digest("hex");
 }

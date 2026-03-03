/**
 * tpex-healthcare-backend\src\models\otpSession.model.js
 *
 * Auto-generated documentation comments.
 */
 import mongoose from "mongoose";

 const otpSessionSchema = new mongoose.Schema(
   {
     email: {
       type: String,
       required: true,
       lowercase: true,
       trim: true,
       index: true,
     },
     otpHash: {
       type: String,
       required: true,
     },
     attemptCount: {
       type: Number,
       default: 0,
       min: 0,
     },
     lockedUntil: {
       type: Date,
       default: null,
     },
     expiresAt: {
       type: Date,
       required: true,
     },
     verifiedAt: {
       type: Date,
       default: null,
     },
   },
   {
     timestamps: true,
   }
 );

 otpSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
 otpSessionSchema.index({ email: 1, verifiedAt: 1 });
 otpSessionSchema.index({ email: 1, lockedUntil: 1 });

 const OtpSession = mongoose.models.OtpSession || mongoose.model("OtpSession", otpSessionSchema);

 export default OtpSession;

/**
 * tpex-healthcare-backend\src\controllers\auth.controller.js
 *
 * Auto-generated documentation comments.
 */
import User from "../models/user.model.js";
import Patient from "../models/patient.model.js";
import Doctor from "../models/doctor.model.js";
import Admin from "../models/admin.model.js";
import { signAccessToken } from "../config/jwt.js";

// Normalize email to lowercase
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Validate email format
function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export async function loginWithEmail(req, res, next) {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required" });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { $set: { lastLoginAt: new Date() } },
      { upsert: true, new: true }
    );

    const bootstrapAdminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
    if (bootstrapAdminEmail) {
      await Admin.findOneAndUpdate(
        { email: bootstrapAdminEmail },
        { $setOnInsert: { email: bootstrapAdminEmail, createdByEmail: bootstrapAdminEmail } },
        { upsert: true, new: true }
      );
    }

    const [patient, doctor, admin] = await Promise.all([
      Patient.findOne({ email }).select({ _id: 1 }).lean(),
      Doctor.findOne({ email }).select({ _id: 1 }).lean(),
      Admin.findOne({ email }).select({ _id: 1 }).lean(),
    ]);

    const isAdmin = Boolean(admin);
    const role = isAdmin ? "admin" : patient ? "patient" : doctor ? "doctor" : null;
    const isRegistered = Boolean(role);

    const accessToken = signAccessToken({ sub: user._id.toString(), email: user.email });

    return res.status(200).json({
      success: true,
      accessToken,
      isRegistered,
      role,
      user: {
        id: user._id.toString(),
        email: user.email,
      },
    });
  } catch (err) {
    return next(err);
  }
}

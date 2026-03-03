/**
 * tpex-healthcare-backend\src\middlewares\admin.middleware.js
 *
 * Auto-generated documentation comments.
 */
import Admin from "../models/admin.model.js";

// admin.middleware.js
//
// adminMiddleware restricts access to admin-only routes.
//
// Requirements:
// - authMiddleware must run first (so req.user is set)
// - the requester's email must exist in the Admin collection
// - and the requester must NOT also be registered as a doctor or patient
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/**
 * adminMiddleware.
 */
/**
 * adminMiddleware.
 */
/**
 * adminMiddleware.
 */
export default async function adminMiddleware(req, res, next) {
  try {
    const userId = req.user?.sub;
    const email = normalizeEmail(req.user?.email);

    if (!userId || !email) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const admin = await Admin.findOne({ email }).select({ _id: 1 }).lean();
    if (!admin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

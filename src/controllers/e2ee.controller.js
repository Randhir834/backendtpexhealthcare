import mongoose from "mongoose";
import E2EEKeyBundle from "../models/e2eeKeyBundle.model.js";
import Doctor from "../models/doctor.model.js";
import Patient from "../models/patient.model.js";

function isValidObjectId(id) {
  return Boolean(id) && mongoose.Types.ObjectId.isValid(String(id));
}

function normalizeBundleInput(body) {
  const registrationId = Number(body?.registrationId);
  const identityKey = String(body?.identityKey || "").trim();
  const signedPreKeyRaw = body?.signedPreKey || {};
  const signedPreKey = {
    id: Number(signedPreKeyRaw?.id),
    publicKey: String(signedPreKeyRaw?.publicKey || "").trim(),
    signature: String(signedPreKeyRaw?.signature || "").trim(),
  };

  const preKeysRaw = Array.isArray(body?.preKeys) ? body.preKeys : [];
  const preKeys = preKeysRaw
    .map((p) => ({
      id: Number(p?.id),
      publicKey: String(p?.publicKey || "").trim(),
    }))
    .filter((p) => Number.isFinite(p.id) && p.publicKey);

  return { registrationId, identityKey, signedPreKey, preKeys };
}

function validateBundle(bundle) {
  if (!Number.isFinite(bundle.registrationId)) return "registrationId is required";
  if (!bundle.identityKey) return "identityKey is required";
  if (!Number.isFinite(bundle.signedPreKey?.id)) return "signedPreKey.id is required";
  if (!bundle.signedPreKey?.publicKey) return "signedPreKey.publicKey is required";
  if (!bundle.signedPreKey?.signature) return "signedPreKey.signature is required";
  return null;
}

export async function upsertMyKeyBundle(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const bundle = normalizeBundleInput(req.body);
    const err = validateBundle(bundle);
    if (err) return res.status(400).json({ success: false, message: err });

    const doc = await E2EEKeyBundle.findOneAndUpdate(
      { userId },
      {
        $set: {
          registrationId: bundle.registrationId,
          identityKey: bundle.identityKey,
          signedPreKey: bundle.signedPreKey,
          preKeys: bundle.preKeys,
        },
      },
      { upsert: true, new: true }
    ).lean();

    return res.status(200).json({ success: true, bundle: doc });
  } catch (e) {
    return next(e);
  }
}

async function resolveUserIdFromPeer({ role, profileId }) {
  if (role === "doctor") {
    const doctor = await Doctor.findById(profileId).select({ userId: 1 }).lean();
    return doctor?.userId?.toString?.() || null;
  }
  if (role === "patient") {
    const patient = await Patient.findById(profileId).select({ userId: 1 }).lean();
    return patient?.userId?.toString?.() || null;
  }
  return null;
}

export async function getPeerKeyBundle(req, res, next) {
  try {
    const role = String(req.params?.role || "").trim().toLowerCase();
    const profileId = String(req.params?.profileId || "").trim();

    if (!profileId || !isValidObjectId(profileId)) {
      return res.status(400).json({ success: false, message: "Valid profileId is required" });
    }
    if (role !== "doctor" && role !== "patient") {
      return res.status(400).json({ success: false, message: "Valid role is required" });
    }

    const userId = await resolveUserIdFromPeer({ role, profileId });
    if (!userId || !isValidObjectId(userId)) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const bundle = await E2EEKeyBundle.findOne({ userId }).lean();
    if (!bundle) {
      return res.status(404).json({ success: false, message: "Key bundle not found" });
    }

    return res.status(200).json({ success: true, bundle });
  } catch (e) {
    return next(e);
  }
}

// doctor.controller.js
 //
 // Doctor controller.
 //
 // Responsibilities:
 // - Public doctor list (only approved doctors are visible to patients)
 // - Profile photo serving via GridFS
 // - Doctor self-registration (multipart + documents)
 // - Doctor self-updates (profile, identity docs, registration certificate)
 import mongoose from "mongoose";
 import Doctor from "../models/doctor.model.js";
 import Patient from "../models/patient.model.js";
 import DoctorRating from "../models/doctorRating.model.js";
 import User from "../models/user.model.js";
 import { deleteFile, getFileInfo, openDownloadStream, uploadBuffer } from "../services/gridfs.service.js";

/**
 * normalizeEmail.
 */
/**
 * normalizeEmail.
 */
/**
 * normalizeEmail.
 */
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function updateMyConsultationFee(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const fee = Number(req.body?.consultationFee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 1000000) {
      return res.status(400).json({ success: false, message: "Valid consultationFee is required" });
    }

    const userObjectId = mongoose.Types.ObjectId.isValid(String(userId))
      ? new mongoose.Types.ObjectId(String(userId))
      : null;
    if (!userObjectId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const upd = await Doctor.collection.updateOne(
      { userId: userObjectId },
      { $set: { consultationFee: fee, updatedAt: new Date() } }
    );
    if (!upd?.matchedCount) {
      return res.status(404).json({ success: false, message: "Doctor profile not found" });
    }

    return res.status(200).json({
      success: true,
      doctor: {
        consultationFee: fee,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function rateDoctor(req, res, next) {
  try {
    const userId = String(req.user?.sub || "").trim();
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doctorId = String(req.params?.doctorId || "").trim();
    if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ success: false, message: "Valid doctorId is required" });
    }

    const rating = Number.parseInt(String(req.body?.rating ?? "").trim(), 10);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be an integer between 1 and 5" });
    }

    const patient = await Patient.findOne({ userId }).select({ _id: 1 }).lean();
    if (!patient) {
      return res.status(403).json({ success: false, message: "Only patients can rate doctors" });
    }

    const doctor = await Doctor.findById(doctorId).select({ adminRating: 1, approvalStatus: 1 }).lean();
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }
    if (doctor.approvalStatus !== "approved") {
      return res.status(400).json({ success: false, message: "Doctor is not verified" });
    }

    const last = await DoctorRating.findOne({ doctorId, userId })
      .sort({ createdAt: -1 })
      .select({ createdAt: 1 })
      .lean();

    if (last?.createdAt) {
      const now = Date.now();
      const lastAt = new Date(last.createdAt).getTime();
      const windowMs = 24 * 60 * 60 * 1000;
      if (now - lastAt < windowMs) {
        const nextAllowedAt = new Date(lastAt + windowMs);
        return res.status(429).json({
          success: false,
          message: "You can rate this doctor again after 24 hours",
          nextAllowedAt,
        });
      }
    }

    await DoctorRating.create({
      doctorId: new mongoose.Types.ObjectId(doctorId),
      userId: new mongoose.Types.ObjectId(userId),
      rating,
    });

    const patientAgg = await DoctorRating.aggregate([
      { $match: { doctorId: new mongoose.Types.ObjectId(doctorId) } },
      { $group: { _id: "$doctorId", count: { $sum: 1 }, sum: { $sum: "$rating" } } },
    ]);

    const aggRow = Array.isArray(patientAgg) && patientAgg.length ? patientAgg[0] : { count: 0, sum: 0 };
    let ratingCount = Number(aggRow?.count || 0);
    let ratingSum = Number(aggRow?.sum || 0);
    if (doctor?.adminRating != null) {
      ratingCount += 1;
      ratingSum += Number(doctor.adminRating);
    }
    const averageRating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;

    return res.status(200).json({
      success: true,
      doctor: {
        id: doctorId,
        averageRating,
        ratingCount,
      },
    });
  } catch (err) {
    return next(err);
  }
}

 /**
  * listDoctors.
  */
 /**
  * listDoctors.
  */
 /**
  * listDoctors.
  */
 export async function listDoctors(req, res, next) {
  try {
    // Public list used by patient-side doctor browsing.
    // Only doctors with approvalStatus = "approved" are returned.
    const doctors = await Doctor.find({ approvalStatus: "approved" })
      .sort({ createdAt: -1 })
      .select("fullName specialty adminRating consultationFee qualification clinicAddress experience timing isOnline")
      .lean();

    const doctorIds = (doctors || []).map((d) => d?._id).filter(Boolean);
    const patientAgg = doctorIds.length
      ? await DoctorRating.aggregate([
          { $match: { doctorId: { $in: doctorIds } } },
          { $group: { _id: "$doctorId", count: { $sum: 1 }, sum: { $sum: "$rating" } } },
        ])
      : [];

    const patientAggMap = new Map(
      (patientAgg || []).map((r) => [String(r?._id || ""), { count: Number(r?.count || 0), sum: Number(r?.sum || 0) }])
    );

    // Transform doctor data for API response
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    return res.status(200).json({
      success: true,
      doctors: (doctors || []).map((d) => {
        const timing = d?.timing || {};
        const isAvailable = Boolean(timing.sessionOneEnabled || timing.sessionTwoEnabled);
        const yearsOfExperience = Number(d?.experience?.totalExperience || 0);

        const agg = patientAggMap.get(String(d?._id || "")) || { count: 0, sum: 0 };
        let ratingCount = agg.count;
        let ratingSum = agg.sum;
        if (d?.adminRating != null) {
          ratingCount += 1;
          ratingSum += Number(d.adminRating);
        }
        const averageRating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;

        return {
          id: d?._id?.toString?.() ?? "",
          fullName: d?.fullName ?? "",
          specialty: d?.specialty ?? "",
          adminRating: d?.adminRating ?? null,
          averageRating,
          ratingCount,
          highestDegree: d?.qualification?.highestDegree ?? "",
          instituteName: d?.qualification?.instituteName ?? "",
          city: d?.clinicAddress?.city ?? "",
          state: d?.clinicAddress?.state ?? "",
          yearsOfExperience,
          isAvailable,
          isOnline: d?.isOnline === true,
          consultationFee: Number(d?.consultationFee || 0),
          photoUrl: d?._id ? `${baseUrl}/doctors/${d._id.toString()}/profile-photo` : "",
        };
      }),
    });
  } catch (err) {
    return next(err);
  }
}

 /**
  * getDoctorProfilePhoto.
  */
 /**
  * getDoctorProfilePhoto.
  */
 /**
  * getDoctorProfilePhoto.
  */
 export async function getDoctorProfilePhoto(req, res, next) {
  try {
    // Public endpoint to stream a doctor's profile photo from GridFS.
    const doctorId = String(req.params?.doctorId || req.params?.id || "").trim();
    if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ success: false, message: "Valid doctorId is required" });
    }

    // Only allow serving profile photo for approved doctors.
    const doctor = await Doctor.findOne({ _id: doctorId, approvalStatus: "approved" })
      .select({ userId: 1 })
      .lean();
    if (!doctor?.userId) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const user = await User.findById(doctor.userId).select({ profilePhoto: 1 }).lean();
    const fileId = user?.profilePhoto?.fileId;
    if (!fileId) {
      return res.status(404).json({ success: false, message: "Profile photo not found" });
    }

    const info = await getFileInfo(fileId);
    if (!info) {
      return res.status(404).json({ success: false, message: "Profile photo not found" });
    }

    res.setHeader("Content-Type", info.contentType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=\"${encodeURIComponent(info.filename || "profile-photo")}"`
    );

    const stream = openDownloadStream(fileId);
    stream.on("error", (err) => next(err));
    return stream.pipe(res);
  } catch (err) {
    return next(err);
  }
}

 /**
  * updateMyDoctorIdentityDocuments.
  */
 /**
  * updateMyDoctorIdentityDocuments.
  */
 /**
  * updateMyDoctorIdentityDocuments.
  */
 export async function updateMyDoctorIdentityDocuments(req, res, next) {
  const uploadedNewFileIds = [];

  try {
    // Update one or more identity documents for the logged-in doctor.
    // New files are uploaded to GridFS and old ones are deleted (best-effort).
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doctor = await Doctor.findOne({ userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor profile not found" });
    }

    if (!doctor.identity) {
      return res.status(400).json({ success: false, message: "Doctor identity details not found" });
    }

    const aadharFrontFile = getUploadedFile(req, "aadharFront");
    const aadharBackFile = getUploadedFile(req, "aadharBack");
    const secondaryIdFile = getUploadedFile(req, "secondaryId");

    if (!aadharFrontFile && !aadharBackFile && !secondaryIdFile) {
      return res.status(400).json({ success: false, message: "No documents provided" });
    }

    const newAadharFrontId = aadharFrontFile
      ? await uploadBuffer({
          buffer: aadharFrontFile.buffer,
          filename: aadharFrontFile.originalname,
          contentType: aadharFrontFile.mimetype,
          metadata: { userId: String(userId), field: "aadharFront" },
        })
      : null;
    if (newAadharFrontId) uploadedNewFileIds.push(newAadharFrontId);

    const newAadharBackId = aadharBackFile
      ? await uploadBuffer({
          buffer: aadharBackFile.buffer,
          filename: aadharBackFile.originalname,
          contentType: aadharBackFile.mimetype,
          metadata: { userId: String(userId), field: "aadharBack" },
        })
      : null;
    if (newAadharBackId) uploadedNewFileIds.push(newAadharBackId);

    const newSecondaryId = secondaryIdFile
      ? await uploadBuffer({
          buffer: secondaryIdFile.buffer,
          filename: secondaryIdFile.originalname,
          contentType: secondaryIdFile.mimetype,
          metadata: { userId: String(userId), field: "secondaryId" },
        })
      : null;
    if (newSecondaryId) uploadedNewFileIds.push(newSecondaryId);

    const oldAadharFrontId = doctor.identity?.aadharFront?.fileId;
    const oldAadharBackId = doctor.identity?.aadharBack?.fileId;
    const oldSecondaryId = doctor.identity?.secondaryId?.fileId;

    doctor.identity = {
      aadharNumber: doctor.identity?.aadharNumber,
      aadharFrontFileName: newAadharFrontId ? aadharFrontFile.originalname : doctor.identity?.aadharFrontFileName,
      aadharFront: newAadharFrontId
        ? {
            fileId: newAadharFrontId,
            filename: aadharFrontFile.originalname,
            contentType: aadharFrontFile.mimetype,
            size: aadharFrontFile.size,
          }
        : doctor.identity?.aadharFront,
      aadharBackFileName: newAadharBackId ? aadharBackFile.originalname : doctor.identity?.aadharBackFileName,
      aadharBack: newAadharBackId
        ? {
            fileId: newAadharBackId,
            filename: aadharBackFile.originalname,
            contentType: aadharBackFile.mimetype,
            size: aadharBackFile.size,
          }
        : doctor.identity?.aadharBack,
      secondaryIdType: doctor.identity?.secondaryIdType,
      secondaryIdNumber: doctor.identity?.secondaryIdNumber,
      secondaryIdFileName: newSecondaryId ? secondaryIdFile.originalname : doctor.identity?.secondaryIdFileName,
      secondaryId: newSecondaryId
        ? {
            fileId: newSecondaryId,
            filename: secondaryIdFile.originalname,
            contentType: secondaryIdFile.mimetype,
            size: secondaryIdFile.size,
          }
        : doctor.identity?.secondaryId,
    };

    await doctor.save();

    const deletes = [];
    if (newAadharFrontId && oldAadharFrontId) deletes.push(deleteFile(oldAadharFrontId));
    if (newAadharBackId && oldAadharBackId) deletes.push(deleteFile(oldAadharBackId));
    if (newSecondaryId && oldSecondaryId) deletes.push(deleteFile(oldSecondaryId));
    if (deletes.length) {
      await Promise.allSettled(deletes);
    }

    return res.status(200).json({
      success: true,
      doctor: {
        id: doctor._id.toString(),
        userId: doctor.userId.toString(),
        approvalStatus: doctor.approvalStatus,
        approvedAt: doctor.approvedAt,
        approvedByEmail: doctor.approvedByEmail,
        isOnline: doctor.isOnline === true,
        fullName: doctor.fullName,
        phone: doctor.phone,
        email: doctor.email,
        specialty: doctor.specialty,
        qualification: doctor.qualification,
        clinicAddress: doctor.clinicAddress,
        identity: {
          aadharNumber: doctor.identity?.aadharNumber,
          aadharFrontFileName: doctor.identity?.aadharFrontFileName,
          aadharFront: doctor.identity?.aadharFront,
          aadharBackFileName: doctor.identity?.aadharBackFileName,
          aadharBack: doctor.identity?.aadharBack,
          secondaryIdType: doctor.identity?.secondaryIdType,
          secondaryIdNumber: doctor.identity?.secondaryIdNumber,
          secondaryIdFileName: doctor.identity?.secondaryIdFileName,
          secondaryId: doctor.identity?.secondaryId,
        },
        experience: doctor.experience,
        timing: doctor.timing,
      },
    });
  } catch (err) {
    if (uploadedNewFileIds.length) {
      await Promise.allSettled(uploadedNewFileIds.map((id) => deleteFile(id)));
    }
    return next(err);
  }
}

/**
 * isValidEmail.
 */
/**
 * isValidEmail.
 */
/**
 * isValidEmail.
 */
function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/**
 * isValidYear.
 */
/**
 * isValidYear.
 */
/**
 * isValidYear.
 */
function isValidYear(year) {
  return Number.isInteger(year) && year >= 1950 && year <= new Date().getFullYear();
}

/**
 * isValidPinCode.
 */
/**
 * isValidPinCode.
 */
/**
 * isValidPinCode.
 */
function isValidPinCode(pinCode) {
  return /^[0-9]{6}$/.test(String(pinCode || "").trim());
}

/**
 * isValidPhone.
 */
/**
 * isValidPhone.
 */
/**
 * isValidPhone.
 */
function isValidPhone(phone) {
  return /^[0-9]{10}$/.test(String(phone || "").trim());
}

/**
 * isValidAadhar.
 */
/**
 * isValidAadhar.
 */
/**
 * isValidAadhar.
 */
function isValidAadhar(aadharNumber) {
  return /^[0-9]{12}$/.test(String(aadharNumber || "").trim());
}

/**
 * getUploadedFile.
 */
/**
 * getUploadedFile.
 */
/**
 * getUploadedFile.
 */
function getUploadedFile(req, field) {
  const files = req.files || {};
  const arr = files?.[field];
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[0];
}

/**
 * isAllowedUpload.
 */
/**
 * isAllowedUpload.
 */
/**
 * isAllowedUpload.
 */
function isAllowedUpload(file) {
  const mimetype = String(file?.mimetype || "").toLowerCase();
  if (mimetype === "application/pdf") return true;
  if (mimetype === "application/x-pdf") return true;
  if (mimetype.startsWith("image/")) return true;

  if (mimetype === "application/octet-stream") {
    const name = String(file?.originalname || "").toLowerCase();
    if (name.endsWith(".pdf")) return true;
    if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png")) return true;
  }
  return false;
}

/**
 * parseBoolean.
 */
/**
 * parseBoolean.
 */
/**
 * parseBoolean.
 */
function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  const v = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(v)) return true;
  if (["false", "0", "no", "n"].includes(v)) return false;
  return defaultValue;
}

/**
 * toInt.
 */
/**
 * toInt.
 */
/**
 * toInt.
 */
function toInt(value) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * isValidTimeHHmm.
 */
/**
 * isValidTimeHHmm.
 */
/**
 * isValidTimeHHmm.
 */
function isValidTimeHHmm(value) {
  if (value === null || value === undefined) return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
}

 /**
  * updateMyDoctorRegistrationCertificate.
  */
 /**
  * updateMyDoctorRegistrationCertificate.
  */
 /**
  * updateMyDoctorRegistrationCertificate.
  */
 export async function updateMyDoctorRegistrationCertificate(req, res, next) {
  let newFileId = null;

  try {
    // Replace the registration certificate PDF for the logged-in doctor.
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doctor = await Doctor.findOne({ userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor profile not found" });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: "Registration certificate file is required" });
    }

    if (!isAllowedUpload(file)) {
      return res.status(400).json({ success: false, message: "Unsupported file type" });
    }

    const mimetype = String(file.mimetype || "").toLowerCase();
    const filename = String(file.originalname || "registration-certificate.pdf").trim();

    const isPdf =
      mimetype === "application/pdf" ||
      mimetype === "application/x-pdf" ||
      (mimetype === "application/octet-stream" && filename.toLowerCase().endsWith(".pdf"));

    if (!isPdf) {
      return res.status(400).json({ success: false, message: "Only PDF is allowed" });
    }

    newFileId = await uploadBuffer({
      buffer: file.buffer,
      filename,
      contentType: file.mimetype,
      metadata: { userId: String(userId), field: "registrationCertificate" },
    });

    const oldFileId = doctor.experience?.doctorRegistrationCertificate?.fileId;

    doctor.experience = {
      councilName: doctor.experience?.councilName,
      registrationNumber: doctor.experience?.registrationNumber,
      registrationYear: doctor.experience?.registrationYear,
      totalExperience: doctor.experience?.totalExperience,
      doctorRegistrationCertificateFileName: filename,
      doctorRegistrationCertificate: {
        fileId: newFileId,
        filename,
        contentType: file.mimetype,
        size: file.size,
      },
    };

    await doctor.save();

    if (oldFileId) {
      await deleteFile(oldFileId);
    }

    return res.status(200).json({
      success: true,
      doctor: {
        id: doctor._id.toString(),
        userId: doctor.userId.toString(),
        approvalStatus: doctor.approvalStatus,
        approvedAt: doctor.approvedAt,
        approvedByEmail: doctor.approvedByEmail,
        fullName: doctor.fullName,
        phone: doctor.phone,
        email: doctor.email,
        specialty: doctor.specialty,
        qualification: doctor.qualification,
        clinicAddress: doctor.clinicAddress,
        identity: {
          aadharNumber: doctor.identity?.aadharNumber,
          aadharFrontFileName: doctor.identity?.aadharFrontFileName,
          aadharFront: doctor.identity?.aadharFront,
          aadharBackFileName: doctor.identity?.aadharBackFileName,
          aadharBack: doctor.identity?.aadharBack,
          secondaryIdType: doctor.identity?.secondaryIdType,
          secondaryIdNumber: doctor.identity?.secondaryIdNumber,
          secondaryIdFileName: doctor.identity?.secondaryIdFileName,
          secondaryId: doctor.identity?.secondaryId,
        },
        experience: doctor.experience,
        timing: doctor.timing,
      },
    });
  } catch (err) {
    if (newFileId) {
      await Promise.allSettled([deleteFile(newFileId)]);
    }
    return next(err);
  }
}

 /**
  * registerDoctor.
  */
 /**
  * registerDoctor.
  */
 /**
  * registerDoctor.
  */
 export async function registerDoctor(req, res, next) {
  const uploadedFileIds = [];

  try {
    // Doctor self-registration.
    // - Requires authMiddleware (email must match verified login)
    // - Requires 4 document uploads (Aadhar front/back, secondary ID, certificate)
    // - Saves doctor profile with approvalStatus = "pending" for admin approval
    console.log("[doctor.register] request received", {
      hasBody: Boolean(req.body),
      bodyKeys: req.body ? Object.keys(req.body) : [],
      fileFields: req.files ? Object.keys(req.files) : [],
    });

    const userId = req.user?.sub;
    const tokenEmail = normalizeEmail(req.user?.email);

    if (!userId || !tokenEmail) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const email = normalizeEmail(req.body?.email) || tokenEmail;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required" });
    }
    if (email !== tokenEmail) {
      return res.status(400).json({
        success: false,
        message: "Email must match the verified login email",
      });
    }

    const fullName = String(req.body?.fullName || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const specialty = String(req.body?.specialty || "").trim();
    if (!fullName) {
      return res.status(400).json({ success: false, message: "Full name is required" });
    }
    if (!phone || !isValidPhone(phone)) {
      return res.status(400).json({ success: false, message: "Valid 10-digit phone is required" });
    }

    if (!specialty) {
      return res.status(400).json({ success: false, message: "Specialty is required" });
    }

    const highestDegree = String(req.body?.highestDegree || "").trim();
    const instituteName = String(req.body?.instituteName || "").trim();
    const yearOfPassing = toInt(req.body?.yearOfPassing);

    const clinicAddress = String(req.body?.clinicAddress || "").trim();
    const state = String(req.body?.state || "").trim();
    const city = String(req.body?.city || "").trim();
    const pinCode = String(req.body?.pinCode || "").trim();

    const aadharNumber = String(req.body?.aadharNumber || "").trim();
    const secondaryIdType = String(req.body?.secondaryIdType || "").trim();
    const secondaryIdNumber = String(req.body?.secondaryIdNumber || "").trim();

    const councilName = String(req.body?.councilName || "").trim();
    const registrationNumber = String(req.body?.registrationNumber || "").trim();
    const registrationYear = toInt(req.body?.registrationYear);
    const totalExperience = toInt(req.body?.totalExperience);
    const aadharFrontFile = getUploadedFile(req, "aadharFront");
    const aadharBackFile = getUploadedFile(req, "aadharBack");
    const secondaryIdFile = getUploadedFile(req, "secondaryId");
    const registrationCertificateFile = getUploadedFile(req, "registrationCertificate");

    const setTimeForAllDays = parseBoolean(req.body?.setTimeForAllDays, true);
    const sessionOneEnabled = parseBoolean(req.body?.sessionOneEnabled, true);
    const sessionOneFrom = req.body?.sessionOneFrom ?? null;
    const sessionOneTo = req.body?.sessionOneTo ?? null;
    const sessionTwoEnabled = parseBoolean(req.body?.sessionTwoEnabled, true);
    const sessionTwoFrom = req.body?.sessionTwoFrom ?? null;
    const sessionTwoTo = req.body?.sessionTwoTo ?? null;

    if (!highestDegree) {
      return res.status(400).json({ success: false, message: "Highest degree is required" });
    }
    if (!instituteName) {
      return res.status(400).json({ success: false, message: "Institute name is required" });
    }
    if (!yearOfPassing || !isValidYear(yearOfPassing)) {
      return res.status(400).json({ success: false, message: "Valid year of passing is required" });
    }

    if (!clinicAddress) {
      return res.status(400).json({ success: false, message: "Clinic address is required" });
    }
    if (!state) {
      return res.status(400).json({ success: false, message: "State is required" });
    }
    if (!city) {
      return res.status(400).json({ success: false, message: "City is required" });
    }
    if (!pinCode || !isValidPinCode(pinCode)) {
      return res.status(400).json({ success: false, message: "Valid 6-digit pin code is required" });
    }

    if (!aadharNumber || !isValidAadhar(aadharNumber)) {
      return res.status(400).json({ success: false, message: "Valid 12-digit Aadhar number is required" });
    }
    if (!aadharFrontFile || !isAllowedUpload(aadharFrontFile)) {
      return res.status(400).json({ success: false, message: "Valid Aadhar front file (PDF/image) is required" });
    }
    if (!aadharBackFile || !isAllowedUpload(aadharBackFile)) {
      return res.status(400).json({ success: false, message: "Valid Aadhar back file (PDF/image) is required" });
    }
    if (!secondaryIdType || !["Pan Card", "Driving License", "Voter ID"].includes(secondaryIdType)) {
      return res.status(400).json({ success: false, message: "Valid secondary ID type is required" });
    }
    if (!secondaryIdNumber) {
      return res.status(400).json({ success: false, message: "Secondary ID number is required" });
    }
    if (!secondaryIdFile || !isAllowedUpload(secondaryIdFile)) {
      return res.status(400).json({ success: false, message: "Valid secondary ID file (PDF/image) is required" });
    }

    if (!councilName) {
      return res.status(400).json({ success: false, message: "Medical council name is required" });
    }
    if (!registrationNumber) {
      return res.status(400).json({ success: false, message: "Registration number is required" });
    }
    if (!registrationYear || !isValidYear(registrationYear)) {
      return res.status(400).json({ success: false, message: "Valid registration year is required" });
    }
    if (totalExperience === null || totalExperience < 0 || totalExperience > 50) {
      return res.status(400).json({ success: false, message: "Valid total experience is required" });
    }
    if (!registrationCertificateFile || !isAllowedUpload(registrationCertificateFile)) {
      return res.status(400).json({
        success: false,
        message: "Valid registration certificate file (PDF/image) is required",
      });
    }

    if (sessionOneEnabled) {
      if (!isValidTimeHHmm(sessionOneFrom) || !isValidTimeHHmm(sessionOneTo)) {
        return res.status(400).json({
          success: false,
          message: "Valid morning session times (HH:mm) are required",
        });
      }
    }
    if (sessionTwoEnabled) {
      if (!isValidTimeHHmm(sessionTwoFrom) || !isValidTimeHHmm(sessionTwoTo)) {
        return res.status(400).json({
          success: false,
          message: "Valid evening session times (HH:mm) are required",
        });
      }
    }
    if (!sessionOneEnabled && !sessionTwoEnabled) {
      return res.status(400).json({
        success: false,
        message: "At least one session must be enabled",
      });
    }

    const existingPhone = await Doctor.findOne({ phone, userId: { $ne: userId } });
    if (existingPhone) {
      return res.status(409).json({ success: false, message: "Phone number already in use" });
    }

    const existingAadhar = await Doctor.findOne({
      "identity.aadharNumber": aadharNumber,
      userId: { $ne: userId },
    });
    if (existingAadhar) {
      return res.status(409).json({ success: false, message: "Aadhar number already in use" });
    }

    const existingRegistration = await Doctor.findOne({
      "experience.registrationNumber": registrationNumber,
      userId: { $ne: userId },
    });
    if (existingRegistration) {
      return res.status(409).json({ success: false, message: "Registration number already in use" });
    }

    const aadharFrontId = await uploadBuffer({
      buffer: aadharFrontFile.buffer,
      filename: aadharFrontFile.originalname,
      contentType: aadharFrontFile.mimetype,
      metadata: { userId: String(userId), field: "aadharFront" },
    });
    uploadedFileIds.push(aadharFrontId);

    const aadharBackId = await uploadBuffer({
      buffer: aadharBackFile.buffer,
      filename: aadharBackFile.originalname,
      contentType: aadharBackFile.mimetype,
      metadata: { userId: String(userId), field: "aadharBack" },
    });
    uploadedFileIds.push(aadharBackId);

    const secondaryId = await uploadBuffer({
      buffer: secondaryIdFile.buffer,
      filename: secondaryIdFile.originalname,
      contentType: secondaryIdFile.mimetype,
      metadata: { userId: String(userId), field: "secondaryId" },
    });
    uploadedFileIds.push(secondaryId);

    const registrationCertificateId = await uploadBuffer({
      buffer: registrationCertificateFile.buffer,
      filename: registrationCertificateFile.originalname,
      contentType: registrationCertificateFile.mimetype,
      metadata: { userId: String(userId), field: "registrationCertificate" },
    });
    uploadedFileIds.push(registrationCertificateId);

    console.log("[doctor.register] files uploaded", {
      userId: String(userId),
      uploadedCount: uploadedFileIds.length,
    });

    const doctor = await Doctor.findOneAndUpdate(
      { userId },
      {
        $set: {
          fullName,
          phone,
          email: tokenEmail,
          specialty,
          approvalStatus: "pending",
          approvedAt: null,
          approvedByEmail: null,
          qualification: {
            highestDegree,
            instituteName,
            yearOfPassing,
          },
          clinicAddress: {
            clinicAddress,
            state,
            city,
            pinCode,
          },
          identity: {
            aadharNumber,
            aadharFrontFileName: aadharFrontFile.originalname,
            aadharFront: {
              fileId: aadharFrontId,
              filename: aadharFrontFile.originalname,
              contentType: aadharFrontFile.mimetype,
              size: aadharFrontFile.size,
            },
            aadharBackFileName: aadharBackFile.originalname,
            aadharBack: {
              fileId: aadharBackId,
              filename: aadharBackFile.originalname,
              contentType: aadharBackFile.mimetype,
              size: aadharBackFile.size,
            },
            secondaryIdType,
            secondaryIdNumber,
            secondaryIdFileName: secondaryIdFile.originalname,
            secondaryId: {
              fileId: secondaryId,
              filename: secondaryIdFile.originalname,
              contentType: secondaryIdFile.mimetype,
              size: secondaryIdFile.size,
            },
          },
          experience: {
            councilName,
            registrationNumber,
            registrationYear,
            totalExperience,
            doctorRegistrationCertificateFileName: registrationCertificateFile.originalname,
            doctorRegistrationCertificate: {
              fileId: registrationCertificateId,
              filename: registrationCertificateFile.originalname,
              contentType: registrationCertificateFile.mimetype,
              size: registrationCertificateFile.size,
            },
          },
          timing: {
            setTimeForAllDays,
            sessionOneEnabled,
            sessionOneFrom: sessionOneEnabled ? String(sessionOneFrom) : null,
            sessionOneTo: sessionOneEnabled ? String(sessionOneTo) : null,
            sessionTwoEnabled,
            sessionTwoFrom: sessionTwoEnabled ? String(sessionTwoFrom) : null,
            sessionTwoTo: sessionTwoEnabled ? String(sessionTwoTo) : null,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log("[doctor.register] doctor saved", {
      doctorId: doctor?._id?.toString?.(),
      userId: doctor?.userId?.toString?.(),
    });

    return res.status(200).json({
      success: true,
      doctor: {
        id: doctor._id.toString(),
        userId: doctor.userId.toString(),
        approvalStatus: doctor.approvalStatus,
        approvedAt: doctor.approvedAt,
        approvedByEmail: doctor.approvedByEmail,
        fullName: doctor.fullName,
        phone: doctor.phone,
        email: doctor.email,
        qualification: doctor.qualification,
        clinicAddress: doctor.clinicAddress,
        identity: {
          aadharNumber: doctor.identity?.aadharNumber,
          aadharFrontFileName: doctor.identity?.aadharFrontFileName,
          aadharFront: doctor.identity?.aadharFront,
          aadharBackFileName: doctor.identity?.aadharBackFileName,
          aadharBack: doctor.identity?.aadharBack,
          secondaryIdType: doctor.identity?.secondaryIdType,
          secondaryIdNumber: doctor.identity?.secondaryIdNumber,
          secondaryIdFileName: doctor.identity?.secondaryIdFileName,
          secondaryId: doctor.identity?.secondaryId,
        },
        experience: doctor.experience,
        timing: doctor.timing,
      },
    });
  } catch (err) {
    if (uploadedFileIds.length) {
      await Promise.allSettled(uploadedFileIds.map((id) => deleteFile(id)));
    }
    return next(err);
  }
}

/**
 * getMyDoctorProfile.
 */
/**
 * getMyDoctorProfile.
 */
/**
 * getMyDoctorProfile.
 */
export async function getMyDoctorProfile(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doctor = await Doctor.findOne({ userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor profile not found" });
    }

    return res.status(200).json({
      success: true,
      doctor: {
        id: doctor._id.toString(),
        userId: doctor.userId.toString(),
        approvalStatus: doctor.approvalStatus,
        approvedAt: doctor.approvedAt,
        approvedByEmail: doctor.approvedByEmail,
        isOnline: doctor.isOnline === true,
        fullName: doctor.fullName,
        phone: doctor.phone,
        email: doctor.email,
        specialty: doctor.specialty,
        consultationFee: Number(doctor.consultationFee || 0),
        qualification: doctor.qualification,
        clinicAddress: doctor.clinicAddress,
        identity: {
          aadharNumber: doctor.identity?.aadharNumber,
          aadharFrontFileName: doctor.identity?.aadharFrontFileName,
          aadharFront: doctor.identity?.aadharFront,
          aadharBackFileName: doctor.identity?.aadharBackFileName,
          aadharBack: doctor.identity?.aadharBack,
          secondaryIdType: doctor.identity?.secondaryIdType,
          secondaryIdNumber: doctor.identity?.secondaryIdNumber,
          secondaryIdFileName: doctor.identity?.secondaryIdFileName,
          secondaryId: doctor.identity?.secondaryId,
        },
        experience: doctor.experience,
        timing: doctor.timing,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * updateMyOnlineStatus.
 */
export async function updateMyOnlineStatus(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (req.body?.isOnline === undefined || req.body?.isOnline === null) {
      return res.status(400).json({ success: false, message: "isOnline is required" });
    }

    const isOnline = parseBoolean(req.body?.isOnline, null);
    if (typeof isOnline !== "boolean") {
      return res.status(400).json({ success: false, message: "Valid isOnline is required" });
    }

    // Use the native collection update so the value is always persisted and is
    // never influenced by schema strictness/caching edge cases.
    const userObjectId = mongoose.Types.ObjectId.isValid(String(userId))
      ? new mongoose.Types.ObjectId(String(userId))
      : null;
    if (!userObjectId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const upd = await Doctor.collection.updateOne(
      { userId: userObjectId },
      { $set: { isOnline, updatedAt: new Date() } }
    );

    if (!upd?.matchedCount) {
      return res.status(404).json({ success: false, message: "Doctor profile not found" });
    }

    const doctor = await Doctor.findOne({ userId: userObjectId }).select({ _id: 1, isOnline: 1 }).lean();

    return res.status(200).json({
      success: true,
      doctor: {
        id: doctor?._id?.toString?.() ?? "",
        isOnline: doctor?.isOnline === true,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * updateMyDoctorProfile.
 */
/**
 * updateMyDoctorProfile.
 */
/**
 * updateMyDoctorProfile.
 */
export async function updateMyDoctorProfile(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doctor = await Doctor.findOne({ userId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor profile not found" });
    }

    const fullName = String(req.body?.fullName || "").trim();
    const phone = String(req.body?.phone || "").trim();

    const specialtyRaw = req.body?.specialty;
    const specialty =
      specialtyRaw === undefined
        ? String(doctor.specialty || "").trim()
        : String(specialtyRaw || "").trim();

    const highestDegree = String(req.body?.highestDegree || "").trim();
    const instituteName = String(req.body?.instituteName || "").trim();
    const yearOfPassing = toInt(req.body?.yearOfPassing);

    const clinicAddress = String(req.body?.clinicAddress || "").trim();
    const state = String(req.body?.state || "").trim();
    const city = String(req.body?.city || "").trim();
    const pinCode = String(req.body?.pinCode || "").trim();

    const aadharNumber = String(req.body?.aadharNumber || "").trim();
    const secondaryIdType = String(req.body?.secondaryIdType || "").trim();
    const secondaryIdNumber = String(req.body?.secondaryIdNumber || "").trim();

    const councilName = String(req.body?.councilName || "").trim();
    const registrationNumber = String(req.body?.registrationNumber || "").trim();
    const registrationYear = toInt(req.body?.registrationYear);
    const totalExperience = toInt(req.body?.totalExperience);

    const setTimeForAllDays = parseBoolean(req.body?.setTimeForAllDays, doctor.timing?.setTimeForAllDays ?? true);
    const sessionOneEnabled = parseBoolean(req.body?.sessionOneEnabled, doctor.timing?.sessionOneEnabled ?? true);
    const sessionOneFrom = req.body?.sessionOneFrom ?? null;
    const sessionOneTo = req.body?.sessionOneTo ?? null;
    const sessionTwoEnabled = parseBoolean(req.body?.sessionTwoEnabled, doctor.timing?.sessionTwoEnabled ?? true);
    const sessionTwoFrom = req.body?.sessionTwoFrom ?? null;
    const sessionTwoTo = req.body?.sessionTwoTo ?? null;

    if (!fullName) {
      return res.status(400).json({ success: false, message: "Full name is required" });
    }
    if (!phone || !isValidPhone(phone)) {
      return res.status(400).json({ success: false, message: "Valid 10-digit phone is required" });
    }

    if (specialtyRaw !== undefined && !specialty) {
      return res.status(400).json({ success: false, message: "Specialty is required" });
    }

    if (!highestDegree) {
      return res.status(400).json({ success: false, message: "Highest degree is required" });
    }
    if (!instituteName) {
      return res.status(400).json({ success: false, message: "Institute name is required" });
    }
    if (!yearOfPassing || !isValidYear(yearOfPassing)) {
      return res.status(400).json({ success: false, message: "Valid year of passing is required" });
    }

    if (!clinicAddress) {
      return res.status(400).json({ success: false, message: "Clinic address is required" });
    }
    if (!state) {
      return res.status(400).json({ success: false, message: "State is required" });
    }
    if (!city) {
      return res.status(400).json({ success: false, message: "City is required" });
    }
    if (!pinCode || !isValidPinCode(pinCode)) {
      return res.status(400).json({ success: false, message: "Valid 6-digit pin code is required" });
    }

    if (!aadharNumber || !isValidAadhar(aadharNumber)) {
      return res.status(400).json({ success: false, message: "Valid 12-digit Aadhar number is required" });
    }
    if (!secondaryIdType || !["Pan Card", "Driving License", "Voter ID"].includes(secondaryIdType)) {
      return res.status(400).json({ success: false, message: "Valid secondary ID type is required" });
    }
    if (!secondaryIdNumber) {
      return res.status(400).json({ success: false, message: "Secondary ID number is required" });
    }

    if (!councilName) {
      return res.status(400).json({ success: false, message: "Medical council name is required" });
    }
    if (!registrationNumber) {
      return res.status(400).json({ success: false, message: "Registration number is required" });
    }
    if (!registrationYear || !isValidYear(registrationYear)) {
      return res.status(400).json({ success: false, message: "Valid registration year is required" });
    }
    if (totalExperience === null || totalExperience < 0 || totalExperience > 50) {
      return res.status(400).json({ success: false, message: "Valid total experience is required" });
    }

    if (sessionOneEnabled) {
      if (!isValidTimeHHmm(sessionOneFrom) || !isValidTimeHHmm(sessionOneTo)) {
        return res.status(400).json({
          success: false,
          message: "Valid morning session times (HH:mm) are required",
        });
      }
    }
    if (sessionTwoEnabled) {
      if (!isValidTimeHHmm(sessionTwoFrom) || !isValidTimeHHmm(sessionTwoTo)) {
        return res.status(400).json({
          success: false,
          message: "Valid evening session times (HH:mm) are required",
        });
      }
    }
    if (!sessionOneEnabled && !sessionTwoEnabled) {
      return res.status(400).json({
        success: false,
        message: "At least one session must be enabled",
      });
    }

    const existingPhoneForUpdate = await Doctor.findOne({ phone, userId: { $ne: userId } });
    if (existingPhoneForUpdate) {
      return res.status(409).json({ success: false, message: "Phone number already in use" });
    }

    const existingAadharForUpdate = await Doctor.findOne({
      "identity.aadharNumber": aadharNumber,
      userId: { $ne: userId },
    });
    if (existingAadharForUpdate) {
      return res.status(409).json({ success: false, message: "Aadhar number already in use" });
    }

    const existingRegistrationForUpdate = await Doctor.findOne({
      "experience.registrationNumber": registrationNumber,
      userId: { $ne: userId },
    });
    if (existingRegistrationForUpdate) {
      return res.status(409).json({ success: false, message: "Registration number already in use" });
    }

    doctor.fullName = fullName;
    doctor.phone = phone;
    if (specialtyRaw !== undefined) {
      doctor.specialty = specialty;
    }

    doctor.qualification = {
      highestDegree,
      instituteName,
      yearOfPassing,
    };

    doctor.clinicAddress = {
      clinicAddress,
      state,
      city,
      pinCode,
    };

    doctor.identity = {
      aadharNumber,
      aadharFrontFileName: doctor.identity?.aadharFrontFileName,
      aadharFront: doctor.identity?.aadharFront,
      aadharBackFileName: doctor.identity?.aadharBackFileName,
      aadharBack: doctor.identity?.aadharBack,
      secondaryIdType,
      secondaryIdNumber,
      secondaryIdFileName: doctor.identity?.secondaryIdFileName,
      secondaryId: doctor.identity?.secondaryId,
    };

    doctor.experience = {
      councilName,
      registrationNumber,
      registrationYear,
      totalExperience,
      doctorRegistrationCertificateFileName: doctor.experience?.doctorRegistrationCertificateFileName,
      doctorRegistrationCertificate: doctor.experience?.doctorRegistrationCertificate,
    };

    doctor.timing = {
      setTimeForAllDays,
      sessionOneEnabled,
      sessionOneFrom: sessionOneEnabled ? String(sessionOneFrom) : null,
      sessionOneTo: sessionOneEnabled ? String(sessionOneTo) : null,
      sessionTwoEnabled,
      sessionTwoFrom: sessionTwoEnabled ? String(sessionTwoFrom) : null,
      sessionTwoTo: sessionTwoEnabled ? String(sessionTwoTo) : null,
    };

    await doctor.save();

    return res.status(200).json({
      success: true,
      doctor: {
        id: doctor._id.toString(),
        userId: doctor.userId.toString(),
        fullName: doctor.fullName,
        phone: doctor.phone,
        email: doctor.email,
        specialty: doctor.specialty,
        qualification: doctor.qualification,
        clinicAddress: doctor.clinicAddress,
        identity: {
          aadharNumber: doctor.identity?.aadharNumber,
          aadharFrontFileName: doctor.identity?.aadharFrontFileName,
          aadharFront: doctor.identity?.aadharFront,
          aadharBackFileName: doctor.identity?.aadharBackFileName,
          aadharBack: doctor.identity?.aadharBack,
          secondaryIdType: doctor.identity?.secondaryIdType,
          secondaryIdNumber: doctor.identity?.secondaryIdNumber,
          secondaryIdFileName: doctor.identity?.secondaryIdFileName,
          secondaryId: doctor.identity?.secondaryId,
        },
        experience: doctor.experience,
        timing: doctor.timing,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// admin.controller.js
 //
 // Admin controller.
 //
 // Responsibilities:
 // - Doctor approval workflow (pending list, details, approve)
 // - Register a doctor by admin (creates user + doctor and marks approved)
 // - List patients and view patient details
 // - Stream profile photos via GridFS for admin dashboards
 import mongoose from "mongoose";
 import Doctor from "../models/doctor.model.js";
 import Patient from "../models/patient.model.js";
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

// ... (rest of the code remains the same)

 function isValidEmail(email) {
   return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || "").trim());
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
  * listPendingDoctors.
  */
 /**
  * listPendingDoctors.
  */
 /**
  * listPendingDoctors.
  */
 export async function listPendingDoctors(req, res, next) {
  try {
    // Admin list: doctors not yet approved.
    const doctors = await Doctor.find({ approvalStatus: { $ne: "approved" } })
      .sort({ createdAt: -1 })
      .select("fullName email phone specialty approvalStatus createdAt")
      .lean();

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    return res.status(200).json({
      success: true,
      doctors: (doctors || []).map((d) => ({
        id: d?._id?.toString?.() ?? "",
        fullName: d?.fullName ?? "",
        email: d?.email ?? "",
        phone: d?.phone ?? "",
        specialty: d?.specialty ?? "",
        approvalStatus: d?.approvalStatus ?? "pending",
        photoUrl: d?._id ? `${baseUrl}/admin/doctors/${d._id.toString()}/profile-photo` : "",
        createdAt: d?.createdAt ?? null,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

 /**
  * listPatients.
  */
 /**
  * listPatients.
  */
 /**
  * listPatients.
  */
 export async function listPatients(req, res, next) {
  try {
    // Admin list: all patient profiles.
    const patients = await Patient.find({})
      .sort({ createdAt: -1 })
      .select("fullName email phone gender dob currentLocation createdAt")
      .lean();

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    return res.status(200).json({
      success: true,
      patients: (patients || []).map((p) => ({
        id: p?._id?.toString?.() ?? "",
        fullName: p?.fullName ?? "",
        email: p?.email ?? "",
        phone: p?.phone ?? "",
        gender: p?.gender ?? "",
        dob: p?.dob ?? null,
        currentLocation: p?.currentLocation ?? "",
        photoUrl: p?._id ? `${baseUrl}/admin/patients/${p._id.toString()}/profile-photo` : "",
        createdAt: p?.createdAt ?? null,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

 /**
  * getPatientDetails.
  */
 /**
  * getPatientDetails.
  */
 /**
  * getPatientDetails.
  */
 export async function getPatientDetails(req, res, next) {
  try {
    // Admin detail: a specific patient's profile.
    const patientId = String(req.params?.id || "").trim();
    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ success: false, message: "Valid patient id is required" });
    }

    const patient = await Patient.findById(patientId).lean();
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return res.status(200).json({
      success: true,
      patient: {
        id: patient._id.toString(),
        userId: patient.userId?.toString?.() ?? "",
        fullName: patient.fullName,
        email: patient.email,
        phone: patient.phone,
        dob: patient.dob,
        gender: patient.gender,
        currentLocation: patient.currentLocation,
        createdAt: patient.createdAt,
        photoUrl: patient._id ? `${baseUrl}/admin/patients/${patient._id.toString()}/profile-photo` : "",
        profilePhotoUrl: patient._id ? `${baseUrl}/admin/patients/${patient._id.toString()}/profile-photo` : "",
      },
    });
  } catch (err) {
    return next(err);
  }
}

 /**
  * getPatientProfilePhotoForAdmin.
  */
 /**
  * getPatientProfilePhotoForAdmin.
  */
 /**
  * getPatientProfilePhotoForAdmin.
  */
 export async function getPatientProfilePhotoForAdmin(req, res, next) {
  try {
    // Admin streaming of a patient's profile photo.
    const patientId = String(req.params?.id || "").trim();
    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ success: false, message: "Valid patient id is required" });
    }

    const patient = await Patient.findById(patientId).select({ userId: 1 }).lean();
    if (!patient?.userId) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    const user = await User.findById(patient.userId).select({ profilePhoto: 1 }).lean();
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
      `inline; filename=\"${encodeURIComponent(info.filename || "profile-photo")}\"`
    );

    const stream = openDownloadStream(fileId);
    stream.on("error", (err) => next(err));
    return stream.pipe(res);
  } catch (err) {
    return next(err);
  }
}

 /**
  * getDoctorProfilePhotoForAdmin.
  */
 /**
  * getDoctorProfilePhotoForAdmin.
  */
 /**
  * getDoctorProfilePhotoForAdmin.
  */
 export async function getDoctorProfilePhotoForAdmin(req, res, next) {
  try {
    // Admin streaming of a doctor's profile photo.
    const doctorId = String(req.params?.id || "").trim();
    if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ success: false, message: "Valid doctor id is required" });
    }

    const doctor = await Doctor.findById(doctorId).select({ userId: 1 }).lean();
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
      `inline; filename=\"${encodeURIComponent(info.filename || "profile-photo")}\"`
    );

    const stream = openDownloadStream(fileId);
    stream.on("error", (err) => next(err));
    return stream.pipe(res);
  } catch (err) {
    return next(err);
  }
}

 /**
  * registerDoctorByAdmin.
  */
 /**
  * registerDoctorByAdmin.
  */
 /**
  * registerDoctorByAdmin.
  */
 export async function registerDoctorByAdmin(req, res, next) {
  const uploadedFileIds = [];

  try {
    // Admin creates a doctor profile (and user record if needed) and marks it approved.
    // Used when onboarding doctors directly through admin panel.
    const adminEmail = normalizeEmail(req.user?.email);
    if (!adminEmail) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const email = normalizeEmail(req.body?.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required" });
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

    const setTimeForAllDays = parseBoolean(req.body?.setTimeForAllDays, true);
    const sessionOneEnabled = parseBoolean(req.body?.sessionOneEnabled, true);
    const sessionOneFrom = req.body?.sessionOneFrom ?? null;
    const sessionOneTo = req.body?.sessionOneTo ?? null;
    const sessionTwoEnabled = parseBoolean(req.body?.sessionTwoEnabled, true);
    const sessionTwoFrom = req.body?.sessionTwoFrom ?? null;
    const sessionTwoTo = req.body?.sessionTwoTo ?? null;

    const aadharFrontFile = getUploadedFile(req, "aadharFront");
    const aadharBackFile = getUploadedFile(req, "aadharBack");
    const secondaryIdFile = getUploadedFile(req, "secondaryId");
    const registrationCertificateFile = getUploadedFile(req, "registrationCertificate");

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

    const user = await User.findOneAndUpdate(
      { email },
      { $setOnInsert: { email } },
      { upsert: true, new: true }
    );

    const userId = user._id;

    const existingPhone = await Doctor.findOne({ phone, userId: { $ne: userId } }).lean();
    if (existingPhone) {
      return res.status(409).json({ success: false, message: "Phone number already in use" });
    }

    const existingAadhar = await Doctor.findOne({ "identity.aadharNumber": aadharNumber, userId: { $ne: userId } }).lean();
    if (existingAadhar) {
      return res.status(409).json({ success: false, message: "Aadhar number already in use" });
    }

    const existingRegistration = await Doctor.findOne({ "experience.registrationNumber": registrationNumber, userId: { $ne: userId } }).lean();
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

    const doctor = await Doctor.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          fullName,
          phone,
          email,
          specialty,
          approvalStatus: "approved",
          approvedAt: new Date(),
          approvedByEmail: adminEmail,
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

    return res.status(200).json({
      success: true,
      doctor: {
        id: doctor._id.toString(),
        userId: doctor.userId.toString(),
        approvalStatus: doctor.approvalStatus,
        approvedAt: doctor.approvedAt,
        approvedByEmail: doctor.approvedByEmail,
        fullName: doctor.fullName,
        email: doctor.email,
        phone: doctor.phone,
        specialty: doctor.specialty,
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
  * listVerifiedDoctors.
  */
 /**
  * listVerifiedDoctors.
  * listVerifiedDoctors.
  */
 export async function listVerifiedDoctors(req, res, next) {
 try {
    // Admin list: approved doctors.
    const doctors = await Doctor.find({ approvalStatus: "approved" })
      .sort({ approvedAt: -1, createdAt: -1 })
      .select("fullName email phone specialty adminRating approvalStatus approvedAt createdAt")
      .lean();

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    return res.status(200).json({
      success: true,
      doctors: (doctors || []).map((d) => ({
        id: d?._id?.toString?.() ?? "",
        fullName: d?.fullName ?? "",
        email: d?.email ?? "",
        phone: d?.phone ?? "",
        specialty: d?.specialty ?? "",
        adminRating: d?.adminRating ?? null,
        approvalStatus: d?.approvalStatus ?? "approved",
        photoUrl: d?._id ? `${baseUrl}/admin/doctors/${d._id.toString()}/profile-photo` : "",
        approvedAt: d?.approvedAt ?? null,
        createdAt: d?.createdAt ?? null,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

export async function setDoctorAdminRating(req, res, next) {
 try {
    const adminEmail = normalizeEmail(req.user?.email);
    if (!adminEmail) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doctorId = String(req.params?.id || "").trim();
    if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ success: false, message: "Valid doctor id is required" });
    }

    const rating = Number.parseInt(String(req.body?.rating ?? "").trim(), 10);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be an integer between 0 and 5" });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    if (doctor.approvalStatus !== "approved") {
      return res.status(400).json({ success: false, message: "Doctor is not verified" });
    }

    doctor.adminRating = rating === 0 ? null : rating;
    await doctor.save();

    return res.status(200).json({
      success: true,
      doctor: {
        id: doctor._id.toString(),
        adminRating: doctor.adminRating ?? null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

 /**
  * getDoctorForApproval.
  */
 /**
  * getDoctorForApproval.
  */
 /**
  * getDoctorForApproval.
  */
 export async function getDoctorForApproval(req, res, next) {
  try {
    // Admin detail: full doctor profile including documents metadata.
    const doctorId = req.params?.id;
    if (!doctorId) {
      return res.status(400).json({ success: false, message: "Doctor id is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(String(doctorId))) {
      return res.status(400).json({ success: false, message: "Valid doctor id is required" });
    }

    const doctor = await Doctor.findById(doctorId).lean();
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const makeFileUrl = (fileId) => (fileId ? `${baseUrl}/files/${String(fileId)}` : "");

    return res.status(200).json({
      success: true,
      doctor: {
        id: doctor._id.toString(),
        userId: doctor.userId?.toString?.() ?? "",
        fullName: doctor.fullName,
        email: doctor.email,
        phone: doctor.phone,
        specialty: doctor.specialty,
        qualification: doctor.qualification,
        clinicAddress: doctor.clinicAddress,
        identity: {
          aadharNumber: doctor.identity?.aadharNumber,
          aadharFrontFileName: doctor.identity?.aadharFrontFileName,
          aadharFront: doctor.identity?.aadharFront,
          aadharFrontUrl: makeFileUrl(doctor.identity?.aadharFront?.fileId),
          aadharBackFileName: doctor.identity?.aadharBackFileName,
          aadharBack: doctor.identity?.aadharBack,
          aadharBackUrl: makeFileUrl(doctor.identity?.aadharBack?.fileId),
          secondaryIdType: doctor.identity?.secondaryIdType,
          secondaryIdNumber: doctor.identity?.secondaryIdNumber,
          secondaryIdFileName: doctor.identity?.secondaryIdFileName,
          secondaryId: doctor.identity?.secondaryId,
          secondaryIdUrl: makeFileUrl(doctor.identity?.secondaryId?.fileId),
        },
        experience: {
          councilName: doctor.experience?.councilName,
          registrationNumber: doctor.experience?.registrationNumber,
          registrationYear: doctor.experience?.registrationYear,
          totalExperience: doctor.experience?.totalExperience,
          doctorRegistrationCertificateFileName: doctor.experience?.doctorRegistrationCertificateFileName,
          doctorRegistrationCertificate: doctor.experience?.doctorRegistrationCertificate,
          doctorRegistrationCertificateUrl: makeFileUrl(doctor.experience?.doctorRegistrationCertificate?.fileId),
        },
        timing: doctor.timing,
        approvalStatus: doctor.approvalStatus,
        approvedAt: doctor.approvedAt,
        approvedByEmail: doctor.approvedByEmail,
        photoUrl: doctor._id ? `${baseUrl}/admin/doctors/${doctor._id.toString()}/profile-photo` : "",
        profilePhotoUrl: doctor._id ? `${baseUrl}/admin/doctors/${doctor._id.toString()}/profile-photo` : "",
        createdAt: doctor.createdAt,
      },
    });
  } catch (err) {
    return next(err);
  }
}

 /**
  * approveDoctor.
  */
 /**
  * approveDoctor.
  */
 /**
  * approveDoctor.
  */
 export async function approveDoctor(req, res, next) {
  try {
    // Admin action: approve a pending doctor.
    const adminEmail = normalizeEmail(req.user?.email);
    if (!adminEmail) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const doctorId = req.params?.id;
    if (!doctorId) {
      return res.status(400).json({ success: false, message: "Doctor id is required" });
    }

    // ... (rest of the code remains the same)

    if (!mongoose.Types.ObjectId.isValid(String(doctorId))) {
      return res.status(400).json({ success: false, message: "Valid doctor id is required" });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    doctor.approvalStatus = "approved";
    doctor.approvedAt = new Date();
    doctor.approvedByEmail = adminEmail || null;
    await doctor.save();

    return res.status(200).json({
      success: true,
      doctor: {
        id: doctor._id.toString(),
        approvalStatus: doctor.approvalStatus,
        approvedAt: doctor.approvedAt,
        approvedByEmail: doctor.approvedByEmail,
      },
    });
  } catch (err) {
    return next(err);
  }
}

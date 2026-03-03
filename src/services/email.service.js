/**
 * tpex-healthcare-backend\src\services\email.service.js
 *
 * Auto-generated documentation comments.
 */
import { createTransporter } from "../config/mail.js";

async function sendViaResend({ from, to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const err = new Error("Email configuration missing: RESEND_API_KEY");
    err.statusCode = 500;
    throw err;
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      ...(html ? { html } : {}),
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    const err = new Error(`Resend email failed: ${resp.status} ${resp.statusText}${body ? ` - ${body}` : ""}`);
    err.statusCode = 502;
    throw err;
  }
}

export async function sendEmail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  if (process.env.RESEND_API_KEY) {
    await sendViaResend({ from, to, subject, text, html });
    return;
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });
}

/**
 * sendOtpEmail.
 */
export async function sendOtpEmail({ to, otp }) {
  const subject = "Your TPEx Healthcare OTP";
  const expireMinutes = process.env.OTP_EXPIRE_MINUTES || 5;
  const text = `Your OTP is: ${otp}. It will expire in ${expireMinutes} minutes.`;

  const html = `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Your one-time password (OTP) for TPEx Healthcare is ${otp}. It expires in ${expireMinutes} minutes.
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#f5f7fb;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7eaf0;">
            <tr>
              <td style="padding:20px 22px;background:linear-gradient(135deg,#0ea5e9 0%,#2563eb 55%,#4f46e5 100%);">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
                      <div style="font-size:16px;letter-spacing:0.2px;opacity:0.95;">TPEx Healthcare</div>
                      <div style="font-size:22px;font-weight:700;line-height:1.2;margin-top:6px;">Verify your email</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 22px 10px 22px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
                <div style="font-size:14px;line-height:1.6;color:#334155;">
                  Use the OTP below to complete your sign-in. This code is valid for <strong>${expireMinutes} minutes</strong>.
                </div>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:14px 22px 8px 22px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                  <tr>
                    <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;letter-spacing:6px;color:#111827;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:14px;padding:14px 18px;">
                      ${otp}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 22px 18px 22px;font-family:Arial,Helvetica,sans-serif;">
                <div style="font-size:12px;line-height:1.6;color:#64748b;">
                  If you didn’t request this code, you can safely ignore this email.
                  For your security, don’t share this OTP with anyone.
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 22px;background:#f8fafc;border-top:1px solid #e7eaf0;font-family:Arial,Helvetica,sans-serif;">
                <div style="font-size:12px;line-height:1.6;color:#64748b;">
                  Sent by TPEx Healthcare
                </div>
              </td>
            </tr>
          </table>

          <div style="max-width:600px;margin:12px auto 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center;">
            Please do not reply to this email.
          </div>
        </td>
      </tr>
    </table>
  `.trim();

  await sendEmail({ to, subject, text, html });
}

export async function sendAppointmentConfirmationEmail({
  to,
  patientName,
  doctorName,
  dateTime,
  timeSlot,
  consultationType,
  location,
  fee,
  appointmentId,
}) {
  const subject = "Appointment Confirmation - TPEx Healthcare";

  const whenText = dateTime
    ? `${new Date(dateTime).toLocaleString()}${timeSlot ? ` (${timeSlot})` : ""}`
    : `${timeSlot || ""}`.trim();
  const locationText = String(location || "").trim() || (consultationType === "in_clinic" ? "Clinic" : "Online");
  const consultText = String(consultationType || "").trim() || "in_clinic";
  const feeText = Number.isFinite(Number(fee)) ? String(Number(fee)) : "";

  const text =
    `Hello ${patientName || "Patient"},\n\n` +
    `Your appointment has been successfully booked.\n\n` +
    `Appointment Details:\n` +
    `- Appointment ID: ${appointmentId || ""}\n` +
    `- Doctor: ${doctorName || ""}\n` +
    `- Date/Time: ${whenText}\n` +
    `- Consultation Type: ${consultText}\n` +
    `- Location: ${locationText}\n` +
    (feeText ? `- Fee: ${feeText}\n` : "") +
    `\nThank you,\nTPEx Healthcare`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <p>Hello ${patientName || "Patient"},</p>
      <p>Your appointment has been successfully booked.</p>
      <h3 style="margin: 16px 0 8px;">Appointment Details</h3>
      <table cellpadding="6" cellspacing="0" border="0" style="border-collapse: collapse;">
        <tr><td><strong>Appointment ID</strong></td><td>${appointmentId || ""}</td></tr>
        <tr><td><strong>Doctor</strong></td><td>${doctorName || ""}</td></tr>
        <tr><td><strong>Date/Time</strong></td><td>${whenText}</td></tr>
        <tr><td><strong>Consultation Type</strong></td><td>${consultText}</td></tr>
        <tr><td><strong>Location</strong></td><td>${locationText}</td></tr>
        ${feeText ? `<tr><td><strong>Fee</strong></td><td>${feeText}</td></tr>` : ""}
      </table>
      <p style="margin-top: 16px;">Thank you,<br/>TPEx Healthcare</p>
    </div>
  `.trim();

  await sendEmail({ to, subject, text, html });
}

export async function sendAppointmentReminderEmail({
  to,
  patientName,
  doctorName,
  dateTime,
  timeSlot,
  consultationType,
  location,
  fee,
  appointmentId,
}) {
  const subject = "Appointment Reminder - TPEx Healthcare";

  const whenText = dateTime
    ? `${new Date(dateTime).toLocaleString()}${timeSlot ? ` (${timeSlot})` : ""}`
    : `${timeSlot || ""}`.trim();
  const locationText = String(location || "").trim() || (consultationType === "in_clinic" ? "Clinic" : "Online");
  const consultText = String(consultationType || "").trim() || "in_clinic";
  const feeText = Number.isFinite(Number(fee)) ? String(Number(fee)) : "";

  const text =
    `Hello ${patientName || "Patient"},\n\n` +
    `This is a reminder for your upcoming appointment. Please do not miss your booking.\n\n` +
    `Appointment Details:\n` +
    `- Appointment ID: ${appointmentId || ""}\n` +
    `- Doctor: ${doctorName || ""}\n` +
    `- Date/Time: ${whenText}\n` +
    `- Consultation Type: ${consultText}\n` +
    `- Location: ${locationText}\n` +
    (feeText ? `- Fee: ${feeText}\n` : "") +
    `\nThank you,\nTPEx Healthcare`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <p>Hello ${patientName || "Patient"},</p>
      <p>This is a reminder for your upcoming appointment. <strong>Please do not miss your booking.</strong></p>
      <h3 style="margin: 16px 0 8px;">Appointment Details</h3>
      <table cellpadding="6" cellspacing="0" border="0" style="border-collapse: collapse;">
        <tr><td><strong>Appointment ID</strong></td><td>${appointmentId || ""}</td></tr>
        <tr><td><strong>Doctor</strong></td><td>${doctorName || ""}</td></tr>
        <tr><td><strong>Date/Time</strong></td><td>${whenText}</td></tr>
        <tr><td><strong>Consultation Type</strong></td><td>${consultText}</td></tr>
        <tr><td><strong>Location</strong></td><td>${locationText}</td></tr>
        ${feeText ? `<tr><td><strong>Fee</strong></td><td>${feeText}</td></tr>` : ""}
      </table>
      <p style="margin-top: 16px;">Thank you,<br/>TPEx Healthcare</p>
    </div>
  `.trim();

  await sendEmail({ to, subject, text, html });
}

export async function sendAppointmentRescheduledEmail({
  to,
  patientName,
  doctorName,
  dateTime,
  timeSlot,
  consultationType,
  location,
  fee,
  appointmentId,
}) {
  const subject = "Appointment Rescheduled - TPEx Healthcare";

  const whenText = dateTime
    ? `${new Date(dateTime).toLocaleString()}${timeSlot ? ` (${timeSlot})` : ""}`
    : `${timeSlot || ""}`.trim();
  const locationText = String(location || "").trim() || (consultationType === "in_clinic" ? "Clinic" : "Online");
  const consultText = String(consultationType || "").trim() || "in_clinic";
  const feeText = Number.isFinite(Number(fee)) ? String(Number(fee)) : "";

  const text =
    `Hello ${patientName || "Patient"},\n\n` +
    `Your appointment has been successfully rescheduled.\n\n` +
    `Updated Appointment Details:\n` +
    `- Appointment ID: ${appointmentId || ""}\n` +
    `- Doctor: ${doctorName || ""}\n` +
    `- New Date/Time: ${whenText}\n` +
    `- Consultation Type: ${consultText}\n` +
    `- Location: ${locationText}\n` +
    (feeText ? `- Fee: ${feeText}\n` : "") +
    `\nThank you,\nTPEx Healthcare`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <p>Hello ${patientName || "Patient"},</p>
      <p>Your appointment has been successfully rescheduled.</p>
      <h3 style="margin: 16px 0 8px;">Updated Appointment Details</h3>
      <table cellpadding="6" cellspacing="0" border="0" style="border-collapse: collapse;">
        <tr><td><strong>Appointment ID</strong></td><td>${appointmentId || ""}</td></tr>
        <tr><td><strong>Doctor</strong></td><td>${doctorName || ""}</td></tr>
        <tr><td><strong>New Date/Time</strong></td><td>${whenText}</td></tr>
        <tr><td><strong>Consultation Type</strong></td><td>${consultText}</td></tr>
        <tr><td><strong>Location</strong></td><td>${locationText}</td></tr>
        ${feeText ? `<tr><td><strong>Fee</strong></td><td>${feeText}</td></tr>` : ""}
      </table>
      <p style="margin-top: 16px;">Thank you,<br/>TPEx Healthcare</p>
    </div>
  `.trim();

  await sendEmail({ to, subject, text, html });
}

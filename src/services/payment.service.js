
import crypto from "crypto";
import Razorpay from "razorpay";

function getRazorpayClient() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) {
    const err = new Error("Razorpay is not configured");
    err.statusCode = 500;
    throw err;
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

export function getRazorpayKeyId() {
  return String(process.env.RAZORPAY_KEY_ID || "").trim();
}

export async function createRazorpayOrder({ amountInPaise, receipt, notes }) {
  const amount = Number(amountInPaise);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error("Valid amount is required");
    err.statusCode = 400;
    throw err;
  }

  const client = getRazorpayClient();
  const order = await client.orders.create({
    amount: Math.round(amount),
    currency: "INR",
    receipt: String(receipt || "").trim() || undefined,
    notes: notes && typeof notes === "object" ? notes : undefined,
  });
  return order;
}

export function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const secret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!secret) {
    const err = new Error("Razorpay is not configured");
    err.statusCode = 500;
    throw err;
  }

  const data = `${String(orderId || "").trim()}|${String(paymentId || "").trim()}`;
  const expected = crypto.createHmac("sha256", secret).update(data).digest("hex");
  const provided = String(signature || "").trim();

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch (_) {
    return false;
  }
}

export function verifyRazorpayWebhookSignature({ rawBody, signature }) {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    const err = new Error("Razorpay webhook is not configured");
    err.statusCode = 500;
    throw err;
  }

  const bodyBuffer = Buffer.isBuffer(rawBody)
    ? rawBody
    : typeof rawBody === "string"
      ? Buffer.from(rawBody)
      : Buffer.from(JSON.stringify(rawBody || {}));

  const expected = crypto.createHmac("sha256", secret).update(bodyBuffer).digest("hex");
  const provided = String(signature || "").trim();

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch (_) {
    return false;
  }
}

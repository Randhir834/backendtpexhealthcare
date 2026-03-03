import { Server } from "socket.io";
import mongoose from "mongoose";
import { verifyAccessToken } from "../config/jwt.js";
import Doctor from "../models/doctor.model.js";
import Patient from "../models/patient.model.js";
import registerChatSocketHandlers from "./chat.socket.js";

function extractBearerToken(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  const parts = v.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer") return parts[1];
  return v;
}

async function resolveProfile({ userId }) {
  const [doctor, patient] = await Promise.all([
    Doctor.findOne({ userId }).select({ _id: 1 }).lean(),
    Patient.findOne({ userId }).select({ _id: 1 }).lean(),
  ]);

  if (doctor?._id) return { role: "doctor", profileId: doctor._id.toString() };
  if (patient?._id) return { role: "patient", profileId: patient._id.toString() };
  return { role: null, profileId: null };
}

function userRoom({ role, profileId }) {
  return `user:${role}:${profileId}`;
}

export default function initSockets(httpServer) {
  const corsOrigins = String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isProd = process.env.NODE_ENV === "production";

  const io = new Server(httpServer, {
    cors: {
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (!isProd && corsOrigins.length === 0) return cb(null, true);
        if (corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error("Not allowed by CORS"));
      },
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    try {
      const raw =
        socket.handshake?.auth?.token ||
        socket.handshake?.headers?.authorization ||
        socket.handshake?.query?.token;

      const token = extractBearerToken(raw);
      if (!token) {
        const err = new Error("Unauthorized");
        err.data = { code: "UNAUTHORIZED" };
        return next(err);
      }

      const payload = verifyAccessToken(token);
      const userId = payload?.sub;
      if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
        const err = new Error("Unauthorized");
        err.data = { code: "UNAUTHORIZED" };
        return next(err);
      }

      const { role, profileId } = await resolveProfile({ userId });
      if (!role || !profileId) {
        const err = new Error("Forbidden");
        err.data = { code: "FORBIDDEN" };
        return next(err);
      }

      socket.data.userId = String(userId);
      socket.data.role = role;
      socket.data.profileId = profileId;
      return next();
    } catch (_) {
      const err = new Error("Unauthorized");
      err.data = { code: "UNAUTHORIZED" };
      return next(err);
    }
  });

  io.on("connection", (socket) => {
    socket.join(userRoom({ role: socket.data.role, profileId: socket.data.profileId }));
    registerChatSocketHandlers(io, socket);
  });

  return io;
}

import mongoose from "mongoose";
import ChatConversation from "../models/chatConversation.model.js";
import ChatMessage from "../models/chatMessage.model.js";
import Appointment from "../models/appointment.model.js";

function isValidObjectId(id) {
  return Boolean(id) && mongoose.Types.ObjectId.isValid(String(id));
}

function roomName(conversationId) {
  return `conversation:${conversationId}`;
}

function userRoom({ role, profileId }) {
  return `user:${role}:${profileId}`;
}

async function ensureChatAllowed({ doctorId, patientId }) {
  return Appointment.exists({
    doctorId,
    patientId,
    status: { $ne: "cancelled" },
    consultationType: { $in: ["online_chat", "online_video"] },
  });
}

export default function registerChatSocketHandlers(io, socket) {
  socket.on("conversation:join", async (payload, ack) => {
    try {
      const conversationId = String(payload?.conversationId || "").trim();
      if (!isValidObjectId(conversationId)) {
        if (typeof ack === "function") ack({ success: false, message: "Valid conversationId is required" });
        return;
      }

      const conversation = await ChatConversation.findById(conversationId)
        .select({ doctorId: 1, patientId: 1 })
        .lean();
      if (!conversation) {
        if (typeof ack === "function") ack({ success: false, message: "Conversation not found" });
        return;
      }

      const role = socket.data?.role;
      const profileId = socket.data?.profileId;
      const isMember =
        (role === "doctor" && String(conversation.doctorId) === String(profileId)) ||
        (role === "patient" && String(conversation.patientId) === String(profileId));
      if (!isMember) {
        if (typeof ack === "function") ack({ success: false, message: "Forbidden" });
        return;
      }

      const allowed = await ensureChatAllowed({
        doctorId: conversation.doctorId,
        patientId: conversation.patientId,
      });
      if (!allowed) {
        if (typeof ack === "function") {
          ack({ success: false, message: "Chat is only available for Online Consultant appointments" });
        }
        return;
      }

      await socket.join(roomName(conversationId));
      if (typeof ack === "function") ack({ success: true });
    } catch (_) {
      if (typeof ack === "function") ack({ success: false, message: "Failed to join conversation" });
    }
  });

  socket.on("conversation:leave", async (payload, ack) => {
    try {
      const conversationId = String(payload?.conversationId || "").trim();
      if (!isValidObjectId(conversationId)) {
        if (typeof ack === "function") ack({ success: false, message: "Valid conversationId is required" });
        return;
      }
      await socket.leave(roomName(conversationId));
      if (typeof ack === "function") ack({ success: true });
    } catch (_) {
      if (typeof ack === "function") ack({ success: false, message: "Failed to leave conversation" });
    }
  });

  socket.on("message:send", async (payload, ack) => {
    try {
      const conversationId = String(payload?.conversationId || "").trim();
      const ciphertext = String(payload?.ciphertext || "").trim();
      const senderCiphertext = String(payload?.senderCiphertext || "").trim();
      const clientMessageId = String(payload?.clientMessageId || "").trim();

      if (!isValidObjectId(conversationId)) {
        if (typeof ack === "function") ack({ success: false, message: "Valid conversationId is required" });
        return;
      }
      if (!ciphertext) {
        if (typeof ack === "function") ack({ success: false, message: "ciphertext is required" });
        return;
      }

      const conversation = await ChatConversation.findById(conversationId);
      if (!conversation) {
        if (typeof ack === "function") ack({ success: false, message: "Conversation not found" });
        return;
      }

      const role = socket.data?.role;
      const profileId = socket.data?.profileId;
      const isMember =
        (role === "doctor" && String(conversation.doctorId) === String(profileId)) ||
        (role === "patient" && String(conversation.patientId) === String(profileId));
      if (!isMember) {
        if (typeof ack === "function") ack({ success: false, message: "Forbidden" });
        return;
      }

      const allowed = await ensureChatAllowed({
        doctorId: conversation.doctorId,
        patientId: conversation.patientId,
      });
      if (!allowed) {
        if (typeof ack === "function") {
          ack({ success: false, message: "Chat is only available for Online Consultant appointments" });
        }
        return;
      }

      const message = await ChatMessage.create({
        conversationId: conversation._id,
        senderRole: role,
        senderProfileId: profileId,
        type: "text",
        ciphertext,
        senderCiphertext: senderCiphertext || "",
        clientMessageId: clientMessageId || "",
      });

      conversation.lastMessageAt = message.createdAt;
      conversation.lastMessageType = "text";
      await conversation.save();

      const mapped = {
        id: message._id.toString(),
        conversationId: conversation._id.toString(),
        senderRole: message.senderRole,
        senderProfileId: String(message.senderProfileId),
        type: "text",
        ciphertext: message.ciphertext,
        senderCiphertext: message.senderCiphertext || "",
        clientMessageId: message.clientMessageId || "",
        createdAt: message.createdAt ? new Date(message.createdAt).toISOString() : null,
      };

      io.to(roomName(conversationId)).emit("message:new", {
        success: true,
        message: mapped,
        clientMessageId: clientMessageId || null,
      });

      io.to(userRoom({ role: "doctor", profileId: conversation.doctorId.toString() })).emit(
        "conversation:updated",
        {
          success: true,
          conversation: {
            id: conversation._id.toString(),
            lastMessageAt: message.createdAt ? new Date(message.createdAt).toISOString() : null,
            lastMessageType: "text",
          },
        }
      );
      io.to(userRoom({ role: "patient", profileId: conversation.patientId.toString() })).emit(
        "conversation:updated",
        {
          success: true,
          conversation: {
            id: conversation._id.toString(),
            lastMessageAt: message.createdAt ? new Date(message.createdAt).toISOString() : null,
            lastMessageType: "text",
          },
        }
      );

      if (typeof ack === "function") {
        ack({ success: true, message: mapped, clientMessageId: clientMessageId || null });
      }
    } catch (_) {
      if (typeof ack === "function") ack({ success: false, message: "Failed to send message" });
    }
  });

  socket.on("message:ack", async (payload, ack) => {
    try {
      const conversationId = String(payload?.conversationId || "").trim();
      const messageId = String(payload?.messageId || "").trim();
      if (!isValidObjectId(conversationId) || !isValidObjectId(messageId)) {
        if (typeof ack === "function") ack({ success: false, message: "Valid conversationId and messageId are required" });
        return;
      }

      const conversation = await ChatConversation.findById(conversationId)
        .select({ doctorId: 1, patientId: 1 })
        .lean();
      if (!conversation) {
        if (typeof ack === "function") ack({ success: false, message: "Conversation not found" });
        return;
      }

      const role = socket.data?.role;
      const profileId = socket.data?.profileId;
      const isMember =
        (role === "doctor" && String(conversation.doctorId) === String(profileId)) ||
        (role === "patient" && String(conversation.patientId) === String(profileId));
      if (!isMember) {
        if (typeof ack === "function") ack({ success: false, message: "Forbidden" });
        return;
      }

      const message = await ChatMessage.findOne({ _id: messageId, conversationId })
        .select({ senderProfileId: 1 })
        .lean();
      if (!message) {
        if (typeof ack === "function") ack({ success: false, message: "Message not found" });
        return;
      }

      if (String(message.senderProfileId) === String(profileId)) {
        if (typeof ack === "function") ack({ success: false, message: "Sender cannot ack" });
        return;
      }
      if (typeof ack === "function") ack({ success: true });
    } catch (_) {
      if (typeof ack === "function") ack({ success: false, message: "Failed to ack message" });
    }
  });
}

import mongoose from "mongoose";

const encryptedBlobSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    contentType: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const chatMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatConversation",
      required: true,
      index: true,
    },
    senderRole: {
      type: String,
      required: true,
      enum: ["doctor", "patient"],
      index: true,
    },
    senderProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["text", "image", "file"],
      default: "text",
      index: true,
    },
    ciphertext: {
      type: String,
      required: true,
      trim: true,
    },
    senderCiphertext: {
      type: String,
      default: "",
      trim: true,
    },
    clientMessageId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    media: {
      type: encryptedBlobSchema,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

chatMessageSchema.index({ conversationId: 1, createdAt: -1 });

const ChatMessage =
  mongoose.models.ChatMessage || mongoose.model("ChatMessage", chatMessageSchema);

export default ChatMessage;

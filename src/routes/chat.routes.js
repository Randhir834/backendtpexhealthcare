import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import { chatPhotoUpload } from "../middlewares/upload.middleware.js";
import {
  createOrGetConversation,
  ackMessageDelivered,
  downloadMessageFile,
  downloadMessagePhoto,
  getConversationMessages,
  listMyConversations,
  sendMessage,
} from "../controllers/chat.controller.js";

const router = Router();

router.get("/me", authMiddleware, listMyConversations);
router.post("/conversation", authMiddleware, createOrGetConversation);
router.get("/:id/messages", authMiddleware, getConversationMessages);
router.get("/:id/messages/:messageId/photo", authMiddleware, downloadMessagePhoto);
router.get("/:id/messages/:messageId/file", authMiddleware, downloadMessageFile);
router.post("/:id/messages/:messageId/ack", authMiddleware, ackMessageDelivered);
router.post("/:id/messages", authMiddleware, chatPhotoUpload, sendMessage);

export default router;

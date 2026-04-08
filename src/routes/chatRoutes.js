import { Router } from "express";
import {
  getChatById,
  sendchatMessage,
  addDraftedQuery,
  getDraftedQuery,
  getAllChats,
  getChatCounts,
  acknowledgeMessage,
  getUnreadChatCountByStatus,
  broadcastMessage,
  deleteDraftQuery,
  deleteLastMessage,
  markLastMessageAsUnread,
  deleteMessageByIds,
  editMessageByIds,
} from "../controllers/chatController/chatController.js";
import { multerUpload } from "../config/multerConfig.js";

const router = Router();

router.post(
  "/send-message",
  multerUpload.array("attachments", 5),
  sendchatMessage
);
router.get("/get-chat-by-user_id", getChatById);
router.post(
  "/add-drafted-query",
  multerUpload.array("attachments", 5),
  addDraftedQuery
);
router.get("/get-drafted-query", getDraftedQuery);
router.delete("/delete-drafted-query", deleteDraftQuery);
router.post("/get-all-chats", getAllChats);
router.get("/get-chat-count", getChatCounts);
router.get("/get-unread-chat-count-by-status", getUnreadChatCountByStatus);
router.patch("/acknowledge-message", acknowledgeMessage);
router.post(
  "/broadcast-message",
  multerUpload.array("attachments", 5),
  broadcastMessage
);
router.get('/delete-last-message',deleteLastMessage);
router.delete('/message-by-ids',deleteMessageByIds);
router.patch('/message-by-ids',editMessageByIds);
router.patch('/markLastMessageAsUnread',markLastMessageAsUnread)

export default router;

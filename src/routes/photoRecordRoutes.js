import Router from "express";
import { multerUpload } from "../config/multerConfig.js";
import {
  addWeightPhoto,
  deletePhotoRecord,
  getUserPhotosList,
  ackPhoto,
} from "../controllers/photoRecordController.js";

const router = Router();
router.post("/users-photos", getUserPhotosList);
router.post("/add-photo", multerUpload.array("image", 1), addWeightPhoto);
router.delete("/delete/:id", deletePhotoRecord);
router.patch("/ack-photo", ackPhoto);

export default router;

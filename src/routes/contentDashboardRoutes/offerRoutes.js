import Router from "express";
import {
  addOffer,
  changeOfferStatus,
  deleteOffer,
  editOffer,
  getAllOffers,
  updateOffer,
} from "../../controllers/contentDashboardControllers/offersController.js";
import { multerUpload } from "../../config/multerConfig.js";

const router = Router();

router.get("/all", getAllOffers);

router.post("/add", multerUpload.array("offer_banners", 5), addOffer);

router.patch("/edit", multerUpload.array("offer_banners", 5), editOffer);

router.patch("/update/:id", multerUpload.array("files", 5), updateOffer);

router.patch("/change-status/:id", changeOfferStatus);

router.delete("/remove/:id", deleteOffer);

export default router;

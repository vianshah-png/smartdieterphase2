import { Router } from "express";
import {
  addFranchiseInquiry,
  franchiseChapter,
  getCleansePrograms,
  getPoshanPrograms,
  getPrivyAndPlatniumProgramRates,
  getPrograms,
  getTermsandCondition,
  nutripreneurEnquiry,
  websiteHomePage,
} from "../../controllers/website/websiteController.js";

const router = Router();

router.get("/get-programs", getPrograms);
router.get("/get-cleanse-programs", getCleansePrograms);
router.post("/add-franchise-chapter", franchiseChapter);
router.post("/add-nutripreneur-enquiry", nutripreneurEnquiry);
router.post("/franchise-inquiry", addFranchiseInquiry);
router.get("/get-poshan-programs", getPoshanPrograms);
router.get("/terms-and-policy", getTermsandCondition);
router.get("/home-page-details", websiteHomePage);
router.get("/get-privy-and-platinum-rates", getPrivyAndPlatniumProgramRates);

export default router;


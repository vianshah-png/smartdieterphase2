import Router from "express";
import {
  addProgram,
  changeProgramStatus,
  deleteProgram,
  getAllProgramNames,
  getAllPrograms,
  programPageData,
  updateProgram,
} from "../../controllers/contentDashboardControllers/programMasterController.js";
import { multerUpload } from "../../config/multerConfig.js";
import {
  addProgramValidator,
  validateHandler,
  validatePageAndLimit,
} from "../../utils/validators.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";
import { redisKeys } from "../../helper/constant.js";

const router = Router();

router.get(
  "/all",
  redisMiddleware(redisKeys.programMaster),
  validatePageAndLimit,
  getAllPrograms
);
router.get("/program-names", getAllProgramNames);
router.post(
  "/add",
  multerUpload.fields([
    { name: "program_banners", maxCount: 5 },
    { name: "program_thumbnail", maxCount: 1 },
  ]),
  addProgram
);
router.get("/get-program-data/:id", programPageData);
router.patch(
  "/update/:id",
  multerUpload.fields([
    { name: "program_banners", maxCount: 5 },
    { name: "program_thumbnail", maxCount: 1 },
  ]),
  updateProgram
);

router.patch("/change-status/:id", changeProgramStatus);

// router.patch("/change-status/:id", changeProgramStatus);
router.delete("/remove/:id", deleteProgram);
export default router;

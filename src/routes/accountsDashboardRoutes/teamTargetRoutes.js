import { Router } from "express";
import {
  addTeamController,
  deleteTeam,
  editIndividualTargetController,
  editTeamController,
  getAdminTarget,
  getAllTeams,
  getAllTotalBalance,
  getAllTotalBalanceOd,
  getBifurcationCounts,
  getCompanyTarget,
  getCompanyTargetDetails,
  getIndividualTeamTargets,
  getSalesCount,
  getSalesOpporunityTarget,
  todaysWork,
  getIndividualTarget,
} from "../../controllers/accountsDashboardControllers/teamTargetController.js";
import { redisKeys } from "../../helper/constant.js";
import { redisMiddleware } from "../../middlewares/redisMiddleware.js";

const router = Router();

router.post("/create-team", addTeamController);
router.patch("/edit-team", editTeamController);
router.get("/get-teams", getAllTeams);
router.get(
  "/get-individual-target",

  redisMiddleware(redisKeys.individualTarget),
  getIndividualTeamTargets
);

router.patch("/edit-individual-target", editIndividualTargetController);

router.get('/get-admin-target',getAdminTarget)
router.get("/get-company-target", getCompanyTarget);
router.get("/get-company-target-details", getCompanyTargetDetails);
router.get("/get-all-total-balance", getAllTotalBalance);
router.get("/get-all-total-balance-od", getAllTotalBalanceOd);
router.get("/sales", getSalesCount);
router.get("/today-work", todaysWork);
router.get("/get-sales-opportunity", getSalesOpporunityTarget);
router.get("/get-bifurcation-counts", getBifurcationCounts);
router.delete("/delete-team/:id", deleteTeam);
router.get('/get-single-target', getIndividualTarget)
export default router;

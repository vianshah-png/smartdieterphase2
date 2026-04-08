import { Router } from "express";
import { readRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
import {
  getGoals,
  submitGoal,
  updateGoal,
} from "../controllers/goalsController.js";

const router = Router();
router.post("/submit-goal", submitGoal);
router.post("/get-goals", getGoals);
router.patch("/update-goal", updateGoal);
router.get("/migrate-goals-to-new-table", async (req, res, next) => {
  const { results } = await readRecord({
    table: `${tables.bnMyGoals}`,
  });
});

export default router;
// IN PROGRESS

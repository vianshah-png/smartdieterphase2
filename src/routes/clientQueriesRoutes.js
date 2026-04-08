import { Router } from "express";
import {
  addClientQuery,
  changeClientQueryAssignedTo,
  getClientQueries,
  pendingClientQueriesCount,
  updateClientQueriesStatus,
} from "../controllers/clientQueriesController.js";

const router = Router();

router.get("/get-queries", getClientQueries);
router.patch("/update-query", updateClientQueriesStatus);
router.patch("/change-assigned-to", changeClientQueryAssignedTo); 
router.get("/pending-queries-count", pendingClientQueriesCount);
router.post("/add-query", addClientQuery);

export default router;

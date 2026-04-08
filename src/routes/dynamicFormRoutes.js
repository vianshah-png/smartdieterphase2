import { Router } from "express";
import {
    getDynamicForm
} from "../controllers/dynamicFormController.js";
const router = Router();

router.post("/get-dynamic-form", getDynamicForm);

export default router;

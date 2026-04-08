import { Router } from "express";
import {
  generateQrController,
  getShortUrlsController,
  deleteShortUrlController,
} from "../../controllers/contentDashboardControllers/shortUrlController.js";

const router = Router()

router.post('/generate-qr', generateQrController)
router.get('/get-short-urls', getShortUrlsController)
router.delete('/delete-short-url',deleteShortUrlController)




export default router

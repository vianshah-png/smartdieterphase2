import { Router } from "express";
import {
  addWallet,
  getTotalWallet,
  getWalletById,
  getCurrentWallet,
  BulkAddWallet,
  bulkAddWalletByUserId,
  acknowledgeWalletById,
  reCreditWallet,
  debitWallet,
  creditWallet,
  bulkCreditWallet,
  leadCreditWallet,
  leadDebitWallet,
  leadReCreditWallet,
} from "../../controllers/walletControllers/walletController.js";

const router = Router();

router.get("/get-wallet-by-id", getWalletById);
router.post("/add-wallet", addWallet);
router.get("/total-wallet", getTotalWallet);
router.get("/get-current-wallet", getCurrentWallet);
router.post("/bulk-add-wallet", BulkAddWallet);
router.get('/re-credit-wallet',reCreditWallet);
router.get('/credit-wallet',creditWallet);
router.get('/lead-credit-wallet',leadCreditWallet);
router.get('/lead-re-credit-wallet',leadReCreditWallet);
router.get('/lead-debit-wallet',leadDebitWallet);
router.post('/bulk-credit-wallet',bulkCreditWallet)
router.get('/debitWallet',debitWallet);
router.post("/bulk-add-wallet-by-ids", bulkAddWalletByUserId);
router.get("/acknowledge-wallet", acknowledgeWalletById);
export default router;

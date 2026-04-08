import { Router } from "express";
import {
  getRestaurantMenuByCuisineId,
  submitUserRestaurantMenu,
  getUsersWithRestaurantMenus,
  getUserMenuHistory,
  getAlcoholMenu,
  submitUserAlcoholMenu,
  getUserAlcoholHistory,
  getFreeFillerData,
  submitFreeFillerData,
  getCountOfClicksFreeFiller,
  getCalorieCount,
  getFoodItemOnsearch,
  getFreeAccessPopUp,
  getClaraCategoryList,
  getClaraQuestionsAndAnswers,
  getSupportMenuItems,
  getClaraSuggestedReplies
} from "../../controllers/ekitDigitizationControllers/ekitDigitizationController.js";

const router = Router();

router.get("/get-restaurant-menu-by-cuisine-id", getRestaurantMenuByCuisineId);
router.post("/submit-restaurant-menu", submitUserRestaurantMenu);
router.get("/get-restaurant-menu-by-cuisine-id", getUsersWithRestaurantMenus);
router.get("/get-user-menu-history", getUserMenuHistory);
router.get("/get-alcohol-menu", getAlcoholMenu);
router.post("/submit-alcohol-menu", submitUserAlcoholMenu);
router.get("/get-user-alcohol-history", getUserAlcoholHistory);
router.post("/free-filler-data", getFreeFillerData);
router.post("/store-free-filler-data", submitFreeFillerData);
router.post("/free-filler-clicks", getCountOfClicksFreeFiller);
router.get("/get-calories", getCalorieCount);
router.get("/get-search", getFoodItemOnsearch);
router.get("/get-free-access-popup", getFreeAccessPopUp);
router.get("/get-clara-category-list", getClaraCategoryList);
router.get("/get-clara-questions-list", getClaraQuestionsAndAnswers);
router.get("/get-clara-support-menu", getSupportMenuItems);
router.post("/get-clara-suggested-replies", getClaraSuggestedReplies);

export default router;

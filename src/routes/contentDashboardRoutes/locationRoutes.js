import Router from "express";
import {
  getAllCitiesByStateId,
  getAllCountries,
  getAllStatesByCountryId,
  getCountryOnregion,
  getRegion,
} from "../../controllers/contentDashboardControllers/locationController.js";

const router = Router();

router.get("/all-countries", getAllCountries);
router.get("/all-states", getAllStatesByCountryId);
router.get("/all-cities", getAllCitiesByStateId);
router.get("/get-region", getRegion)
router.get("/get-country-region", getCountryOnregion)

export default router;

import { Router } from "express";
import {
  getAssessmentList,
  getPersonalDetails,
  getNutritionAndLifestyleDetails,
  getMedicalHistory,
  getDietRecall,
  getFoodFrequency,
  getAssessmentPhoto,
  getMedicalReports,
  getNoteToMentorAndKhyati,
  getFastingWindowDetails,
  getWorkoutDetails,
  getMedicationDetails,
  submitPersonalDetails,
  submitNutritionAndLifestyleDetails,
  submitWorkoutDetails,
  submitDietRecallDetails,
  submitFoodFrequencyDetails,
  submitAssessmentPhoto,
  submitFastingWindowDetails,
  submitNoteToMentorAndKhyati,
  submitMedicalHistoryDetails,
  submitMedicationDetails,
  submitMedicalReports,
  editPersonalDetails,
  editNutritionAndLifestyleDetails,
  editWorkoutDetails,
  editDietRecallDetails,
  editFoodFrequencyDetails,
  editAssessmentPhoto,
  editFastingWindowDetails,
  editNoteToMentorAndKhyati,
  editMedicalHistoryDetails,
  editMedicationDetails,
  editMedicalReports
} from "../controllers/assessmentController.js";
import { multerUpload } from "../config/multerConfig.js";
const router = Router();

router.post("/get-assessment-list", getAssessmentList);
router.post("/get-personal-details", getPersonalDetails);
router.post(
  "/get-nutrition-and-lifestyle-details",
  getNutritionAndLifestyleDetails
);
router.post("/get-medical-history-details", getMedicalHistory);
router.post("/get-diet-recall-details", getDietRecall);
router.post("/get-food-frequency-details", getFoodFrequency);
router.post("/get-assessment-photo-details", getAssessmentPhoto);
router.post("/get-medical-report-attachment-details", getMedicalReports);
router.post("/get-note-to-mentor-and-khyati-details", getNoteToMentorAndKhyati);
router.post("/get-fasting-window-details", getFastingWindowDetails);
router.post("/get-workout-details", getWorkoutDetails);
router.post("/get-medication-details", getMedicationDetails);
router.post("/submit-personal-details", submitPersonalDetails);
router.post("/edit-personal-details", editPersonalDetails);
router.post(
  "/submit-nutrition-and-lifestyle-details",
  submitNutritionAndLifestyleDetails
);
router.post(
  "/edit-nutrition-and-lifestyle-details",
  editNutritionAndLifestyleDetails
);
router.post(
  "/submit-workout-details",
  submitWorkoutDetails
);
router.post("/edit-workout-details", editWorkoutDetails);
router.post("/submit-diet-recall-details", submitDietRecallDetails);
router.post("/edit-diet-recall-details", editDietRecallDetails);
router.post("/submit-food-frequency", submitFoodFrequencyDetails);
router.post("/edit-food-frequency", editFoodFrequencyDetails);
router.post(
  "/submit-assessment-photo",
  multerUpload.array("files", 1),
  submitAssessmentPhoto
);
router.post(
  "/edit-assessment-photo",
  multerUpload.array("files", 1),
  editAssessmentPhoto
);
router.post("/submit-fasting-window-details", submitFastingWindowDetails);
router.post("/edit-fasting-window-details", editFastingWindowDetails);
router.post("/submit-note-to-mentor-and-khyati", submitNoteToMentorAndKhyati);
router.post("/edit-note-to-mentor-and-khyati", editNoteToMentorAndKhyati);
router.post("/submit-medical-history", submitMedicalHistoryDetails);
router.post("/edit-medical-history", editMedicalHistoryDetails);
router.post("/submit-medication-details", submitMedicationDetails);
router.post("/edit-medication-details", editMedicationDetails);
router.post("/submit-medical-reports",multerUpload.array("files", 1),submitMedicalReports);
router.post(
  "/edit-medical-reports",
  multerUpload.array("files", 1),
  editMedicalReports
);
export default router;

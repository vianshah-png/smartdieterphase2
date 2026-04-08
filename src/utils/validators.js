import { body, validationResult } from "express-validator";
import { ErrorHandler } from "./ErrorClass.js";

const validatePageAndLimit = (req, res, next) => {
  const { page, limit } = req.query;
  console.log(parseInt(limit), 6);
  console.log(parseInt(page), 7);
  if (
    page !== "" &&
    page !== undefined &&
    parseInt(page).toString() === "NaN"
  ) {
    return next(new ErrorHandler("Invalid argument to page parameter", 400));
  }
  if (
    limit !== "" &&
    limit !== undefined &&
    parseInt(limit).toString() === "NaN"
  ) {
    return next(new ErrorHandler("Invalid argument to limit parameter", 400));
  }
  return next();
};
const validateHandler = (req, res, next) => {
  const errors = validationResult(req);
  const errorMessages = errors
    .array()
    .map((error) => error.msg)
    .join(", ");
  if (errors.isEmpty()) return next();
  else next(new ErrorHandler(errorMessages, 400));
};

const validatePassword = () => [
  body("password", "password is required")
    .notEmpty()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number")
    .matches(/[!@#$%^&*(),.?":{}|<>]/)
    .withMessage("Password must contain at least one special character"),
];

const validateUsername = () => [
  body("username", "username is required")
    .notEmpty()
    .isLength({ min: 3, max: 20 })
    .withMessage("Username must be between 3 and 30 characters long")
    .matches(/^[A-Za-z][A-Za-z0-9_]*$/)
    .withMessage(
      "Username must start with an alphabet and can contain only letters, numbers, and underscores"
    ),
];

const validateEmail = () => [
  body("email", "email is required")
    .notEmpty()
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),
];

const addBlogPostValidator = () => [
  body("postTitle", "Please Enter Post Title").notEmpty(),
  body("postDesc", "Please Enter post description").notEmpty(),
  body("postCont", "Please Enter post Content").notEmpty(),
  body("category_id").notEmpty(),
  body("seoKeywords").notEmpty(),
  body("seoDescription").notEmpty(),
  body("seoTitle").notEmpty(),
  body("seoSubject").notEmpty(),
  body("seoAuthor").notEmpty(),
  body("seoSubtitle").notEmpty(),
];

const addCategoryValidator = () => [
  body("category", "Please Enter Category Name").notEmpty(),
  body("added_by", "Please Enter User id ").notEmpty(),
];

const addSubCategoryValidator = () => [
  body("category_id", "Please provide category id").notEmpty(),
  body("added_by", "Please Enter User id ").notEmpty(),
  body("sub_category", "Please Enter Sub Category Name").notEmpty(),
];

const addCuisineValidator = () => [
  body("added_by", "Please Enter User id ").notEmpty(),
  body("cuisine", "Please Enter Cuisine Name").notEmpty(),
];

const addHashtagValidator = () => [
  body("hashtag_name", "Please Enter Hashtag Name").notEmpty(),
  body("added_by", "Please Enter User id ").notEmpty(),
];

const addHealthIssueValidator = () => [
  body("health_issue", "Please Enter Health Issue Name").notEmpty(),
];
const addProgramValidator = () => [
  body("program_name", "Please Enter Program Name").notEmpty(),
  body("ideal_for", "Please Enter Ideal For").notEmpty(),
  body("program_category", "Please provide category category").notEmpty(),
  body("added_by", "Please Enter User id ").notEmpty(),
  body("content", "Please enter content").notEmpty(),
  body("hashtags", "Please provide Hashtags").notEmpty(),
];

const addProgramSessionValidator = () => [
  body("program_id", "Please provide Program ID").notEmpty().isNumeric(),
  body("program_sessions", "Please provide Program Sessions")
    .notEmpty()
    .isNumeric(),
  body("mrp", "Please provide MRP").notEmpty().isNumeric(),
  body("discount", "Please provide Discount").notEmpty().isNumeric(),
  body("buy_price", "Please provide Buy Price").notEmpty().isNumeric(),
  body("program_duration", "Please provide Program Duration").notEmpty(),
  body("weight_loss", "Please provide Weight Loss").notEmpty(),
  body("allow_coupon", "Please provide allow coupon option").notEmpty(),
  body("allow_wallet", "Please provide allow wallet option").notEmpty(),
];

const addFbPostValidator = () => [
  body("fb_post_name", "Please provide Facebook Post Name").notEmpty(),
  body("content", "Please provide Content").notEmpty(),
  body("hashtags_id", "Please provide Hashtags Ids").notEmpty(),
  body("fb_account", "Please provide Facebook Account").notEmpty(),
];

const addInstaPostValidator = () => [
  body("insta_post_name", "Please provide Instagram Post Name").notEmpty(),
  body("content", "Please provide Content").notEmpty(),
  body("hashtags_id", "Please provide Hashtags Ids").notEmpty(),
  body("insta_account", "Please provide Instagram Account").notEmpty(),
];

const addOfferValidator = () => [
  body("title", "Please provide a title").notEmpty(),
  body("type", "Please provide a type").notEmpty(),
  body("amount", "Please provide an amount")
    .notEmpty()
    .isFloat({ min: 0 })
    .withMessage("Amount must be a positive number"),
  body("offer_name", "Please provide an offer name").notEmpty(),
  body("content", "Please provide content").notEmpty(),
];

const addSuccessStoryValidator = () => [
  body("user_id", "User ID is required").notEmpty(),
  body("start_date", "Start date is required").notEmpty(),
  body("end_date", "End date is required").notEmpty(),
  body("weight_loss", "Weight loss is required").notEmpty(),
  body("short_descriptions", "Short descriptions are required").notEmpty(),
  body("long_descriptions", "Long descriptions are required").notEmpty(),
  body("insta_handle", "Instagram handle is required").notEmpty(),
  body("testimonial_video", "Testimonial video is required").notEmpty(),
  body("program_details", "Program details are required").notEmpty(),
  body("health_issues", "Health issues are required").notEmpty(),
];

const validateNotification = () => [
  body("title")
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ max: 255 })
    .withMessage("Title must be less than 255 characters"),
  body("description").notEmpty().withMessage("Body is required"),
  body("redirect_page")
    .notEmpty()
    .withMessage("Redirect page is required")
    .isLength({ max: 255 })
    .withMessage("Redirect page must be less than 255 characters"),
  body("expiry_days")
    .notEmpty()
    .withMessage("Expiry days is required")
    .isInt({ min: 0 })
    .withMessage("Expiry days must be a non-negative integer"),
  body("schedule_date").notEmpty(),
  body("schedule_time").notEmpty(),
  body("promotional")
    .notEmpty()
    .withMessage("Promotional is required")
    .isIn(["yes", "no"])
    .withMessage('Promotional must be either "yes" or "no"'),
  body("mode")
    .notEmpty()
    .withMessage("Mode is required")
    .isIn(["test", "all"])
    .withMessage('Mode must be either "test" or "all"'),

  body("auto_chat")
    .optional()
    .isString()
    .withMessage("Auto chat must be a string"),
];

const addRecipeValidator = () => [
  body("title", "Please provide title").notEmpty(),
  body("category_id", "Please provide category id").notEmpty(),
  body("sub_category_id", "Please provide sub category id").notEmpty(),
  body("cuisine_id", "Please provide cuisine id").notEmpty(),
  body("recipe_type_id", "Please provide recipe type id").notEmpty(),
  body("energy", "Please provide energy").notEmpty(),
  body("protein", "Please provide protein ").notEmpty(),
  body("fat", "Please provide fat ").notEmpty(),
  body("carbs", "Please provide carbs ").notEmpty(),
  body("fiber", "Please provide fiber ").notEmpty(),
  body("calories", "Please provide calories ").notEmpty(),
  body("ingredients", "Please provide ingredients ").notEmpty(),
  body("method", "Please provide method ").notEmpty(),
  body("health_meter", "Please provide health_meter ").notEmpty(),
  body("seoKeywords", "Please provide seoKeywords ").notEmpty(),
  body("seoDescription", "Please provide seoDescription ").notEmpty(),
  body("seoTitle", "Please provide seoTitle ").notEmpty(),
  body("recipe_by", "Please provide recipe_by ").notEmpty(),
  body("hashtags_id", "Please provide hashtags_id ").notEmpty(),
  body("link", "Please provide link ").notEmpty(),
];

const addDraftValidator = () => [
  body("title", "Please provide title ").notEmpty(),
  body("type", "Please provide type ").notEmpty(),
  body("description", "Please provide description ").notEmpty(),
  body("created_by", "Please provide created_by ").notEmpty(),
];

const addRecipeTypeValidator = () => [
  body("recipe_type", "Please provide recipe_type ").notEmpty(),
  body("added_by", "Please provide added_by ").notEmpty(),
];

const addOrderValidator = () => [
  body("user_id").notEmpty("User_id is Required").isNumeric(),
  body("orderDateTime").notEmpty().isDate({
    format: "YYYY-MM-DD HH:mm:ss",
    message: "Invalid date format, please use YYYY-MM-DD HH:mm:ss",
  }),
  body("email").notEmpty("Email is Required").isEmail("Incorrect email format"),
  body("name").notEmpty("Name is Required").isLength({ min: 3 }),
  body("address").isString("Address is Required").notEmpty(),
  body("country_id").notEmpty("Country is Required").isNumeric(),
  body("state_id").notEmpty("State is Required").isNumeric(),
  body("city_id").notEmpty("City is Required").isNumeric(),
  body("pincode").notEmpty("Pincode is Required").isNumeric(),
  body("phone").notEmpty("Phone is Required").isNumeric().isLength({ min: 10 }),
  body("order_type").notEmpty("Order type is Required").isString(),
  body("currency").notEmpty("Currency is Required").isString(),
  body("program_id").notEmpty("Program id is Required").isNumeric(),
  body("session_id").notEmpty("Session id is Required").isNumeric(),
  body("program_amount").notEmpty("Program amount is Required").isNumeric(),
  body("discount").notEmpty("Discount is Required").isNumeric(),
  body("wallet_discount").notEmpty("Wallet discount is Required").isNumeric(),
  body("paid_amount").notEmpty("paid amount is Required").isNumeric(),
  body("balance_amount").notEmpty("Balance amount is Required").isNumeric(),
  body("due_date").notEmpty("Due date is Required").isDate({
    format: "YYYY-MM-DD HH:mm:ss",
    message: "Invalid date format, please use YYYY-MM-DD HH:mm:ss",
  }),
  body("payment_method").notEmpty("Payment method is Required").isString(),
  body("status").notEmpty("User status is Required").isString(),
  body("note").notEmpty("Note is Required").isString(),
  body("mentor_assigned").notEmpty("mentor_assigned").isNumeric(),
  body("sale_by").notEmpty("sale_by").isNumeric(),
];

export {
  validateHandler,
  validatePassword,
  validateUsername,
  validateEmail,
  addBlogPostValidator,
  addCategoryValidator,
  addSubCategoryValidator,
  addCuisineValidator,
  addHashtagValidator,
  addProgramValidator,
  addProgramSessionValidator,
  addFbPostValidator,
  addInstaPostValidator,
  addOfferValidator,
  addSuccessStoryValidator,
  validateNotification,
  addRecipeValidator,
  addDraftValidator,
  addHealthIssueValidator,
  addRecipeTypeValidator,
  addOrderValidator,
  validatePageAndLimit,
};

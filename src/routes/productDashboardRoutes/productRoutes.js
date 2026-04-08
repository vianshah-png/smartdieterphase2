import Router from "express";
import {
  addProduct,
  getShopProducts,
  getProductById,
  deleteProduct,
  getAllProducts,
  getPackSize,
  editProduct,
  hardDelete,
  getAllProductsByBrand,
  allShopBrands,
  allProductsCategoriesByBrand,
  updateProductCategoryMapping,
  shopHomePage,
  getProductByIdSql,
} from "../../controllers/productDashboardController/productController.js";
import multer from "multer";

const router = Router();
const storage = multer.memoryStorage();
const productUpload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 10, // 10MB file limit
  },
});

const uploadProductFiles = productUpload.any();

router.post("/add-product", uploadProductFiles, addProduct);
router.get("/get-products-list", getShopProducts);
router.get("/get-all-products", getAllProducts);
router.get("/get-pack-size", getPackSize);
router.get("/get-product", getProductById);
router.patch("/update-product", uploadProductFiles, editProduct);
router.patch("/toggle-is-active", deleteProduct);
router.delete("/delete-product", hardDelete);

// shop api's
router.get("/shop-homepage", shopHomePage);
router.get("/all-shop-brands", allShopBrands);
router.get('/product/:id', getProductByIdSql);
router.post("/categories", allProductsCategoriesByBrand);
router.post("/all-products", getAllProductsByBrand);
router.patch("/update-product-category", updateProductCategoryMapping);
export default router;
  
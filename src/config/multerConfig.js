import multer from "multer";
import path from "path";

const multerUpload = multer({
  limits: {
    fieldSize: 1024 * 1024 * 5,
  },
});

const excelFileFilter = (req, file, cb) => {
  const allowedTypes = /xlsx|xls/;
  const extName = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimeType = allowedTypes.test(file.mimetype);

  if (extName && mimeType) {
    console.log(extName, mimeType, 18);
    cb(null, true);
  } else {
    console.log(extName, mimeType, 21);
    cb(new Error("Only .xls and .xlsx files are allowed"));
  }
};
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 5,
  },
  // fileFilter: excelFileFilter,
});

export { multerUpload, excelUpload };

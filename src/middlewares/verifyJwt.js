import jwt from "jsonwebtoken";
import { readPool } from "../config/dbConnection.js";
export const verifyJWT = async (req, res, next) => {
  const token = req.headers["x-auth-token"];
  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await readPool.query(
      "SELECT * FROM users WHERE user_id = ?",
      [decoded._id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = rows[0]; // Assuming `rows` is an array of users, take the first one
    next();
  } catch (error) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

import jwt from "jsonwebtoken";
const generateAuthToken = (userId) => {
  const payload = { _id: userId };

  // Sign the token with the user's ID and a secret key
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "1h", // Set token expiration time (e.g., 1 hour)
  });

  return token;
};

export default generateAuthToken;

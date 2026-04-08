import { Schema, model } from "mongoose";

const userVisitLog = new Schema(
  {
    user_id: {
      type: Number,
      required: true,
    },
    page: {
      type: String,
      enum: ["tips", "reel", "recipe", "success_story", "wallet", "peer_group"],
      required: true,
    },
    meta_data: {
      device: String,
      ip: String,
    },
    expireAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const UserVisitLog = model("UserVisitLog", userVisitLog);
export default UserVisitLog;

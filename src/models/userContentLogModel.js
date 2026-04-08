import { Schema, model } from "mongoose";

const userContentLogSchema = new Schema(
  {
    user_id: {
      type: Number,
      required: true,
      index: true,
    },
    content_type: {
      type: String,
      enum: ["reel", "recipe", "success_story"],
      required: true,
      index: true,
    },
    content_id: {
      type: Number,
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["like", "unlike", "share", "view"],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    meta: {
      device: String,
      ip: String,
    },
  },
  {
    versionKey: false,
  }
);

const UserContentLog = model("UserContentLog", userContentLogSchema);
export default UserContentLog;

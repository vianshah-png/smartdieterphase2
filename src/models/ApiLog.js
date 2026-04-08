import { Schema, model } from "mongoose";

const ApiLogSchema = new Schema(
  {
    method: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    curl: {
      type: String,
      required: true,
    },
    status: {
      type: Number,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    isSlow: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Auto-delete logs older than 30 days to manage storage
ApiLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

const ApiLog = model("ApiLog", ApiLogSchema);
export default ApiLog;
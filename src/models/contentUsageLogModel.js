import { Schema, model } from "mongoose";

const contentUsageLogSchema = new Schema(
  {
    content_id: { type: Number, required: true },
    content_type: {
      type: String,
      enum: [
        "blog_post",
        "recipe",
        "success_story",
        "khyatis_content",
        "social_post",
      ],
      required: true,
    },
    platform: {
      type: String,
      enum: [
        "instagram",
        "facebook",
        "youtube",
        "linkedin",
        "twitter",
        "whatsapp",
        "app",
        "website",
      ],
      required: true,
    },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    versionKey: false,
  }
);
const ContentUsageLog = model("ContentUsageLog", contentUsageLogSchema);

export default ContentUsageLog;

import { Schema, model } from "mongoose";

const userNotificationSchema = new Schema(
  {
    user_id: { type: Number, required: true },
    notification_id: { type: Number, required: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    notification_image: { type: String, default: null },
    read_status: { type: Boolean, default: false },
    redirect_page: { type: String, default: null },
    redirect_id: { type: Number, default: null },
    url: { type: String, default: null },
    expiry_date: { type: Date, default: null },
    added_date: { type: Date, default: Date.now },
  },
  { minimize: true }
);

const userNotification = model("userNotification", userNotificationSchema);
export default userNotification;

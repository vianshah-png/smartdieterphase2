import { Schema, model } from "mongoose";

const deletedClientEnquirySchema = new Schema(
  {
    user_id: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    query: {
      type: String,
    },
    mentor_id: {
      type: Number,
      required: true,
    },
    is_response: {
      type: Boolean,
      default: false,
    },
    is_acknowledged: {
      type: Boolean,
      default: false,
    },
    sender: {
      type: String,
      enum: ["mentor", "client"],
      default: "client",
    },
    type: {
      type: String,
      enum: ["query", "replied", "reply", "broadcast", "reminder","clara"],
      default: "query",
    },
    attachment: {
      type: [String],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const deletedClientEnquiry = model("deletedClientEnquiry", deletedClientEnquirySchema);

export default deletedClientEnquiry;
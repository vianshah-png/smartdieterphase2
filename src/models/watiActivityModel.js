import mongoose from "mongoose";

const { Schema } = mongoose;

const WatiActivitySchema = new Schema(
  {
    user_id: {
      type: Number, 
      required: true,
      index: true
    },

    message: {
      type: String,
      trim: true,
      required: true
    },

    button: {
      type: String,
      trim: true,
      default: null
    },

    campaign: {
      type: String,
      trim: true,
      default: null,
      index: true
    }
  },
  {
    timestamps: true, // adds createdAt & updatedAt
    versionKey:false
  }
);

export default mongoose.model("WatiActivity", WatiActivitySchema);

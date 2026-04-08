import { Schema, model } from "mongoose";

const dietDetailsSchema = new Schema(
  {
    diet_name: {
      type: String,
      required: true,
    },
    diet_id: {
      type: Number,
    },
    on_rising: {
      type: String,
    },
    breakfast: {
      type: String,
    },
    pre_breakfast: {
      type: String,
    },
    mid_morning: {
      type: String,
    },
    pre_workout: {
      type: String,
    },
    during_workout: {
      type: String,
    },
    pre_lunch: {
      type: String,
    },
    lunch: {
      type: String,
    },
    post_lunch: {
      type: String,
    },
    tea_eve: {
      type: String,
    },
    late_eve: {
      type: String,
    },
    pre_dinner: {
      type: String,
    },
    dinner: {
      type: String,
    },
    post_dinner: {
      type: String,
    },
    bed_time: {
      type: String,
    },
    attachments: {
      type: [Object],
    },
    diet_note: {
      type: String,
    },
    msg: {
      type: String,
    },
    comment: { type: String },
  },
  { timestamps: true }
);

const dietDetails = model("dietDetails", dietDetailsSchema);

export default dietDetails;

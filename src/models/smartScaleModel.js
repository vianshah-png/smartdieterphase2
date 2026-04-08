import mongoose from "mongoose";

const SmartScaleData = new mongoose.Schema(
  {
    user_id: { type: Number, required: true, index: true },
    sub_order_id: { type: Number, required: true, index: true },
    weight_day: { type: Number, index: true},
    is_acknowledged: { type: Boolean, default: false },
    mentor_id: { type: Number, default: null, index: true },
    acknowledged_by: {type: Number, default: null},
    user_profile: {
      sex: Number,
      age: Number,
      height: Number
    },
    weight_value: Number,
    weight_unit: String, 
    weight_status: Number,
    weight_raw: Number,
    adc: Number,
    algorithm_id: Number,
    data_id: Number,
    device_type: Number,
    additional_data: {
      bmi: Number,
      bodyFatPercentage: Number,
      moisture: Number,
      muscleRate: Number,
      basalMetabolicRate: Number,
      boneMass: Number,
      bodyAge: Number,
      visceralFatIndex: Number,
      proteinRate: Number,
      subcutaneousFat: Number,
      fatMass: Number,
      muscleMass: Number,
      proteinAmount: Number,
      leanBodyMass: Number,
      weightControl: Number,
      standardWeight: Number
    },
    measured_at: Date
  },
  { timestamps: true, versionKey:false }
);

export default mongoose.model("SmartScaleData", SmartScaleData);
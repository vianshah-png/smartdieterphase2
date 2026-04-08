import SmartScaleData from "../../models/smartScaleModel.js"; 
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";

export const submitSmartScaleData = async(req, res, next) => {
  try {
    const {
      user_id,
      sub_order_id,
      weight_day, 
      mentor_id, 
      user_profile,
      weight_value,
      weight_unit,
      weight_status,
      weight_raw,
      adc,
      algorithm_id,
      data_id,
      device_type,
      additional_data,
      measured_at,
    } = req.body;

    const smartScaleData = await SmartScaleData.create({
      user_id,
      sub_order_id,
      weight_day,
      ...(mentor_id && {mentor_id}),
      user_profile: {
        sex: user_profile?.sex,
        age: user_profile?.age,
        height: user_profile?.height,
      },
      weight_value,
      weight_unit,
      weight_status,
      weight_raw,
      adc,
      algorithm_id,
      data_id,
      device_type,
      additional_data,
      measured_at: measured_at ? new Date(measured_at) : new Date(),
    });

    return res.status(201).json(
      new ApiResponse({
        statusCode: 201,
        message: "Smart scale data added successfully",
        data: smartScaleData,
      })
    );

  }
  catch(error) {
    console.error("Smart Scale Data Add Error:", error);
    return next(new ErrorHandler(error.message || "Internal Server Error", 500));
  }
  
};

export const getSmartScaleData = async (req, res, next) => {
  try {
    const {
      id, 
      user_id,
      sub_order_id,
      start_date,
      end_date,
      page = 1,
      limit = 20,
      weight_day,
    } = req.query;

    const filter = {};
    if (id) filter._id = id ; 
    if (user_id) filter.user_id = user_id;
    if (sub_order_id) filter.sub_order_id = sub_order_id;

    if (weight_day) filter.weight_day = weight_day;

    if (start_date || end_date) {
      filter.createdAt = {};
      if (start_date) filter.createdAt.$gte = new Date(start_date);
      if (end_date) filter.createdAt.$lte = new Date(end_date);
    }

    const skip = (page - 1) * limit;

    const data = await SmartScaleData.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await SmartScaleData.countDocuments(filter);

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Smart scale data fetched successfully",
        data,
        meta_data: {
          total,
          page: Number(page),
          limit: Number(limit),
        },
      })
    );

  } catch (error) {
    console.error("Smart Scale Data Fetch Error:", error);
    return next(new ErrorHandler(error.message || "Internal Server Error", 500));
  }
};

export const acknowledgeSmartScaleWeightData = async(req,res,next)=> {
    try {
    const {id} = req.params;
    const {acknowledged_by} = req.body;
    const smartScaleData = await SmartScaleData.updateOne(
      {_id: id},
      {$set: {is_acknowledged: true, acknowledged_by: acknowledged_by}}
    );

    return res.status(201).json(
      new ApiResponse({
        statusCode: 201,
        message: "Smart scale data acknowledged successfully",
        data: smartScaleData,
      })
    );

  }
  catch(error) {
    console.error("Smart Scale Data Acknowledge Error:", error);
    return next(new ErrorHandler(error.message || "Internal Server Error", 500));
  }
}

export const checkSmartScaleWeightDataExists = async(user_id)=> {
  try {
    
    const count = await SmartScaleData.countDocuments({user_id});
    if(count > 0) {
      return true ; 
    }

    return false ; 

  }
  catch(error) {
    console.error("Smart Scale Data Check Error:", error);
    return false ; 
  }
}


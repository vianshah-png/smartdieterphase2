import moment from "moment";
import { ApiResponse } from "../../utils/APiResponse.js";
import { ErrorHandler } from "../../utils/ErrorClass.js";
import {
  buildPerformanceRoiReportHtml,
  getPerformanceRoiReportData,
  sendPerformanceRoiReportMail,
} from "../../services/performanceRoiReportService.js";

const performanceRoiReportPreview = async (req, res, next) => {
  try {
    const date =
      req.query.date || moment().subtract(1, "day").format("YYYY-MM-DD");
    if (!moment(date, "YYYY-MM-DD", true).isValid()) {
      return next(new ErrorHandler("Invalid date format, use YYYY-MM-DD", 400));
    }

    const report = await getPerformanceRoiReportData({ date });
    const html = buildPerformanceRoiReportHtml(report);

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Performance ROI report generated successfully",
        data: {
          reportDate: report.meta.reportDate,
          html,
          report,
        },
      }),
    );
  } catch (error) {
    console.error("Error in performanceRoiReportPreview:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

const performanceRoiReportSend = async (req, res, next) => {
  try {
    const {
      date = moment().subtract(1, "day").format("YYYY-MM-DD"),
    } = req.body || {};

    if (!moment(date, "YYYY-MM-DD", true).isValid()) {
      return next(new ErrorHandler("Invalid date format, use YYYY-MM-DD", 400));
    }

    const result = await sendPerformanceRoiReportMail({ date });

    return res.status(200).json(
      new ApiResponse({
        statusCode: 200,
        message: "Performance ROI report email sent successfully",
        data: result,
      }),
    );
  } catch (error) {
    console.error("Error in performanceRoiReportSend:", error);
    return next(new ErrorHandler("Internal server error", 500));
  }
};

export { performanceRoiReportPreview, performanceRoiReportSend };

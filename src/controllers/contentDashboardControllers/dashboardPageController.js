import { readRecordUnion } from "../../config/query.js";
import { ApiResponse } from "../../utils/APiResponse.js";

const programColumnData = async (_, res, next) => {
  const programCardCountsQuery = [
    {
      selectField: "'good_mails_count' as type, COUNT(*) as count",
      table: "good_mails",
      condition: [],
    },
    {
      selectField: "'program_offer_images_count' as type, COUNT(*) as count",
      table: "program_offer_images",
      condition: [],
    },
    {
      selectField: "'program_drafts_count' as type, COUNT(*) as count",
      table: "drafts",
      condition: [
        {
          field: "type",
          operator: "=",
          value: "Program Drafts",
        },
      ],
    },
    {
      selectField: "'program_rate_drafts_count' as type, COUNT(*) as count",
      table: "drafts",
      condition: [
        {
          field: "type",
          operator: "=",
          value: "Program Rate Drafts",
        },
      ],
    },
  ];
  try {
    const programCardCount = await readRecordUnion(programCardCountsQuery);
    console.log(programCardCount, 40);
    const apiResponse = new ApiResponse(
      200,
      "program card count fetched successfully",
      programCardCount
    );
    return res.status(200).json([apiResponse]);
  } catch (error) {
    console.log(error);
    return next(new ErrorResponse("Internal Server Error", 500));
  }
};

export { programColumnData };

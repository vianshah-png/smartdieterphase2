import { readRecord } from "../config/query.js";
import { tables } from "../helper/constant.js";
const getWhatsappTextUtil = async ({
  label,
  variables = [],
  to = "client",
}) => {
  try {
    const { results } = await readRecord({
      table: `${tables.whatsappText} wt`,
      selectFields: ["wt.whatsapp_text", "wt.text_to"],
      search: {
        searchQuery: decodeURIComponent(label),
        searchFields: ["wt.label"],
      },
      conditions: [
        {
          field: "wt.text_to",
          operator: "=",
          value: to,
        },
      ],
    });
    let formattedText = results[0]?.whatsapp_text;
    variables.forEach((variable) => {
      console.log("variable", variable) ; 
      const key = new RegExp(`{{${variable.key}}}`, "g");
      formattedText = formattedText.replace(key, variable.value);
    });
    return { formattedText: formattedText, textTo: results[0]["wt.text_to"] };
  } catch (error) {
    console.log(error);
    throw new Error("Error getting whatsapp text");
  }
};

const getWhatsappTextUtilOnce = async ({
  label,
  variables = [],
  to = "client",
}) => {
  try {
    const { results } = await readRecord({
      table: `${tables.whatsappText} wt`,
      selectFields: ["wt.whatsapp_text", "wt.text_to"],
      search: {
        searchQuery: decodeURIComponent(label),
        searchFields: ["wt.label"],
      },
      conditions: [
        {
          field: "wt.text_to",
          operator: "=",
          value: to,
        },
      ],
    });
   
    return { clientWhatsappText: results[0]?.whatsapp_text, textTo: results[0]["wt.text_to"] };
  } catch (error) {
    console.log(error);
    throw new Error("Error getting whatsapp text");
  }
};



export { getWhatsappTextUtil, getWhatsappTextUtilOnce };

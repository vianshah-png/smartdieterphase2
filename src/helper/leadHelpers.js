import e from "cors";
import { insertRecord, readRecord, updateRecord } from "../config/query.js";
import {
  addLeadAssignLog,
  addPhaseLogNew,
  addSaleStatusLogNew,
  addSourceLogNew,
} from "../controllers/salesDashboardControllers/leadsController.js";
import { createPaymentLink } from "../utils/createPaymentLink.js";
import { tables, sources } from "./constant.js";
import { safeJSONParse } from "./commonHelper.js";

const reAssignLeadUtil = async ({
  user_id,
  new_counsellor_id,
  assigned_by,
}) => {
  try {
    const updateCounsellor = await updateRecord(
      tables.userDetails,
      { counsellor_assigned: new_counsellor_id },
      { user_id: parseInt(user_id) }
    );
    console.log(updateCounsellor);
    if (updateCounsellor.affectedRows === 0) {
      throw new Error("Failed to re_assign lead");
    }
    const { log } = await addLeadAssignLog({
      user_id,
      counsellor_id: new_counsellor_id,
      assigned_by,
    });
    if (log.affectedRows === 0) {
      throw new Error("Failed to add lead assign log");
    }
    return { success: true };
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

const updatePrimarySourceUtil = async ({
  user_id,
  current_primary_lead_source,
}) => {
  try {
    const updatePrimarySource = await updateRecord(
      tables.userDetails,
      { current_lead_source: current_primary_lead_source },
      { user_id: parseInt(user_id) }
    );
    if (updatePrimarySource.affectedRows === 0) {
      throw new Error("Failed to update primary lead source");
    }
    const { logresult } = await addSourceLogNew({
      source: sources[current_primary_lead_source],
      id: user_id,
    });
    if (logresult.affectedRows === 0) {
      throw new Error("Failed to add lead source log");
    }
    return { success: true };
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};

const updateSaleStatus = async ({ user_id, sale_status }) => {
  try {
    console.log(sale_status, 69);
    const updateSaleStatus = await updateRecord(
      tables.userDetails,
      { sales_status: sale_status },
      { user_id: parseInt(user_id) }
    );
    if (updateSaleStatus.affectedRows === 0) {
      throw new Error("Failed to update sale status");
    }
    const { success } = await addSaleStatusLogNew({
      sales_status: sale_status,
      id: user_id,
    });
    if (!success) {
      throw new Error("Failed to add sales status log");
    }
    return { success: true };
  } catch (error) {
    console.log(error);
    throw new Error(error.message);
  }
};
const updateClinicalConditions = async ({ user_id, health_conditions }) => {
  try {
    const updatedHealthConditions = await updateRecord(
      tables.userDetails,
      { health_conditions: health_conditions },
      { user_id: parseInt(user_id) }
    );

    if (updatedHealthConditions.affectedRows === 0) {
      throw new Error("Failed to update health conditions");
    }

    return { success: true };
  } catch (error) {
    console.error(error);
    throw new Error(error.message);
  }
};

const updateKeyInsights = async ({
  lifestyle,
  health_history,
  target_oriented,
  meal_management,
  frequency,
  consultation_note,
  communication,
  suggested_program_id,
  suggested_program_session_id,
  suggested_amount,
  payment_expiry,
  awareness_level,
  motivational_level,
  payment_mode_id,
  language,
  special_note,
  user_id,
  admin_id,
}) => {
  try {
    const { results: consultationResults } = await readRecord({
      table: `${tables.consultationLogs} cl`,
      conditions: [{ field: "cl.user_id", operator: "=", value: user_id }],
      joins: [
        {
          table: `${tables.userDetails} ud`,
          on: "cl.user_id = ud.user_id",
          type: "INNER",
        },
      ],
      selectFields: [
        "cl.key_insights",
        "ud.email_id",
        `CASE 
  WHEN ud.phone_code NOT IN ('0', '', 'NULL') AND ud.phone_code IS NOT NULL THEN 
    CONCAT(
      REPLACE(REPLACE(ud.phone_code, '+', ''), ' ', ''), 
      REPLACE(ud.phone_number, ' ', '')
    )
  ELSE 
    REPLACE(REPLACE(ud.phone, '+', ''), ' ', '')
END AS phone_number`,
        "CONCAT(COALESCE(ud.first_name, ''), ' ', COALESCE(ud.last_name, '')) AS full_name",
      ],
    });

    let keyInsights = {};
    if (consultationResults.length > 0 && consultationResults[0].key_insights) {
      keyInsights = JSON.parse(consultationResults[0].key_insights) || {};
    }

    keyInsights.lifestyle = lifestyle || null;
    keyInsights.health_history = health_history || null;
    keyInsights.target_oriented = target_oriented || null;
    keyInsights.meal_management = meal_management || null;
    keyInsights.frequency = frequency || null;
    keyInsights.consultation_note = consultation_note || null;
    keyInsights.communication = communication || null;
    keyInsights.awareness_level = awareness_level || null;
    keyInsights.motivational_level = motivational_level || null;
    keyInsights.language = language || null;
    keyInsights.special_note = special_note || null;

    if (suggested_program_id) {
      const { results: existingSuggestedProgram } = await readRecord({
        table: `${tables.suggestedProgram}`,
        conditions: [{ field: "user_id", operator: "=", value: user_id }],
        selectFields: [
          "suggested_program_id",
          "program_id",
          "program_session_id",
          "payment_mode_id",
          "payment_link_id",
        ],
        orderBy: ["added_date DESC"],
      });

      const { results: programDetails } = await readRecord({
        table: `${tables.programsMaster} pm`,
        selectFields: ["pm.program_name"],
        conditions: [
          {
            field: "pm.program_id",
            operator: "=",
            value: suggested_program_id,
          },
        ],
      });

      keyInsights.suggested_program = {
        program_name: programDetails[0].program_name,
        program_amount: suggested_amount,
      };

      const { results: adminDetails } = await readRecord({
        table: `${tables.adminUsers} ad`,
        selectFields: [
          "ad.first_name as admin_first_name",
          "ad.last_name as admin_last_name",
        ],
        conditions: [
          { field: "ad.admin_user_id", operator: "=", value: admin_id },
        ],
      });

      let payment_link_id = null;

      const createAndInsertPaymentLink = async () => {
        const payment_link = await createPaymentLink({
          amount: suggested_amount,
          expire_by: payment_expiry,
          customerDetails: {
            email: consultationResults[0].email_id,
            phone: `${consultationResults[0].phone_number}`,
          },
          description: `Payment Link For ${consultationResults[0].full_name} For ${programDetails[0].program_name}`,
          user: consultationResults[0].full_name,
          email: consultationResults[0].email_id,
          phone: consultationResults[0].phone_number,
          created_by: `${adminDetails[0].admin_first_name} ${adminDetails[0].admin_last_name}`,
        });

        const newLink = await insertRecord(
          `${tables.paymentLinks}`,
          [
            "payment_link_id",
            "email",
            "phone_number",
            "program_id",
            "program_session_id",
            "amount",
            "expiry_at",
            "payment_link",
            "user_id",
            "admin_user_id",
          ],
          [
            payment_link.id,
            consultationResults[0].email_id,
            consultationResults[0].phone_number,
            suggested_program_id,
            suggested_program_session_id,
            suggested_amount,
            payment_expiry,
            payment_link.short_url,
            user_id,
            admin_id,
          ]
        );

        if (newLink.affectedRows === 0)
          throw new Error("Failed to insert payment link");
        return newLink.insertId;
      };

      if (existingSuggestedProgram.length > 0) {
        const existing = existingSuggestedProgram[0];
        const isSameProgram =
          Number(existing.program_id) === Number(suggested_program_id) &&
          Number(existing.program_session_id) ===
            Number(suggested_program_session_id);

        if (isSameProgram) {
          if (Number(payment_mode_id) === 1 && !existing.payment_link_id) {
            // CASE 1: same program, mode 1, no link
            payment_link_id = await createAndInsertPaymentLink();

            const updateResult = await updateRecord(
              tables.suggestedProgram,
              {
                payment_link_id,
                payment_mode_id,
                payment_expiry,
                suggested_by: admin_id,
              },
              { suggested_program_id: existing.suggested_program_id }
            );

            if (updateResult.affectedRows === 0)
              throw new Error(
                "Failed to update suggested program with payment link"
              );
          } else if (Number(payment_mode_id) !== 1) {
            // CASE 2: same program, mode != 1
            const updateResult = await updateRecord(
              tables.suggestedProgram,
              {
                payment_mode_id,
                payment_expiry,
                payment_link_id: null,
                suggested_by: admin_id,
              },
              { suggested_program_id: existing.suggested_program_id }
            );

            if (updateResult.affectedRows === 0)
              throw new Error("Failed to update suggested program");
          }
        } else {
          // CASE 3: different program or session
          if (Number(payment_mode_id) === 1) {
            payment_link_id = await createAndInsertPaymentLink();
          }

          const fields = [
            "user_id",
            "program_id",
            "program_session_id",
            "suggested_amount",
            "payment_mode_id",
            ...(payment_link_id ? ["payment_link_id"] : []),
            "payment_expiry",
            "suggested_by",
          ];
          const values = [
            user_id,
            suggested_program_id,
            suggested_program_session_id,
            suggested_amount,
            payment_mode_id,
            ...(payment_link_id ? [payment_link_id] : []),
            payment_expiry,
            admin_id,
          ];

          const insertRes = await insertRecord(
            tables.suggestedProgram,
            fields,
            values
          );
          if (insertRes.affectedRows === 0)
            throw new Error("Failed to insert new suggested program");

          const updatedUser = await updateRecord(
            `${tables.userDetails}`,
            { suggested_program_id: insertRes.insertId },
            { user_id: user_id }
          );
          if (updatedUser.affectedRows === 0)
            throw new Error("Failed to update user with new suggested program");
        }
      } else {
        // CASE 4: No suggested program at all
        if (Number(payment_mode_id) === 1) {
          payment_link_id = await createAndInsertPaymentLink();
        }

        const fields = [
          "user_id",
          "program_id",
          "program_session_id",
          "suggested_amount",
          "payment_mode_id",
          ...(payment_link_id ? ["payment_link_id"] : []),
          "payment_expiry",
          "suggested_by",
        ];
        const values = [
          user_id,
          suggested_program_id,
          suggested_program_session_id,
          suggested_amount,
          payment_mode_id,
          ...(payment_link_id ? [payment_link_id] : []),
          payment_expiry,
          admin_id,
        ];

        const insertRes = await insertRecord(
          tables.suggestedProgram,
          fields,
          values
        );
        if (insertRes.affectedRows === 0)
          throw new Error("Failed to insert new suggested program");

        const updatedUser = await updateRecord(
          `${tables.userDetails}`,
          { suggested_program_id: insertRes.insertId },
          { user_id: user_id }
        );
        if (updatedUser.affectedRows === 0)
          throw new Error("Failed to update user with new suggested program");
      }
    }

    const updatedKeyInsights = JSON.stringify(keyInsights);

    if (consultation_note){
      await insertRecord(
        tables.callUpdates,
        [
          "user_id",
          "call_type",
          "user_type",
          "comment",
          "call_status",
          "added_by",
          "source",
        ],
        [user_id, "30", "Lead", special_note, 1, admin_id, "Web"]
      );

      if (consultation_note) {
        await insertRecord(
          `${tables.consultationLogs}`,
          ["user_id", "key_insights", "consultation_by"],
          [user_id, updatedKeyInsights, admin_id]
        );
      }
    }

    return { success: true };
  } catch (error) {
    console.error(error);
    throw new Error(error.message);
  }
};

const updateUserPhaseUtil = async ({
  user_id,
  lifestyle,
  communication,
  awareness_level,
  motivational_level,
  language,
}) => {
  try {
    if (
      !lifestyle ||
      !communication ||
      !awareness_level ||
      !motivational_level ||
      !language ||
      !user_id
    ) {
      return {
        success: false,
        message: "Insufficient data to calculate phase",
      };
    }
    let points = 0;
    console.log(
      lifestyle,
      communication,
      awareness_level,
      motivational_level,
      language
    );
    const lifestyles = safeJSONParse(lifestyle, []);
    for (let i = 0; i < lifestyles.length; i++) {
      if (
        ["Busy executive", "Traveller", "Student Life / Living Alone"].includes(
          lifestyles[i]
        )
      ) {
        points += 2;
        break;
      }
    }
    if (communication === "Asking Queries") points += 2;
    if (awareness_level === "High") points += 2;
    else if (awareness_level === "Medium") points += 1;

    if (motivational_level === "High") points += 2;
    else if (motivational_level === "Medium") points += 1;
    if (language === "English") points += 1;
    console.log(points, "phase points");
    let phase = null;
    if (points >= 8) phase = 4;
    else if (points >= 5) phase = 3;
    else if (points >= 3) phase = 2;
    else phase = 1;
    console.log(phase, "phase");
    const { results: currentPhase } = await readRecord({
      selectFields: ["current_phase as phase"],
      table: tables.userDetails,
      conditions: [{ field: "user_id", operator: "=", value: user_id }],
    });
    console.log(currentPhase, "currentPhase");
    const updatedData = {
      current_phase: phase,
      previous_phase: currentPhase[0].phase,
    };
    if (
      currentPhase.length > 0 &&
      currentPhase[0].phase &&
      phase < currentPhase[0].phase
    ) {
      updatedData.is_phase_down_grade = 1;
    }
    const updatePhase = await updateRecord(tables.userDetails, updatedData, {
      user_id: parseInt(user_id),
    });
    if (updatePhase.affectedRows > 0) {
      await addPhaseLogNew({ id: user_id, phase });
      return { success: true, message: "Phase updated successfully", phase };
    }
    return { success: false, message: "No changes made to phase" };
  } catch (error) {
    console.log(error);
    return { success: false, message: error.message };
  }
};
export {
  reAssignLeadUtil,
  updatePrimarySourceUtil,
  updateSaleStatus,
  updateClinicalConditions,
  updateKeyInsights,
  updateUserPhaseUtil,
};

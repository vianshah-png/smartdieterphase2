import { readRecord } from "./src/config/query.js";
import { tables } from "./src/helper/constant.js";

async function run() {
  try {
    const { results: dietResults } = await readRecord({
      table: `${tables.specialDietPlan} dp`,
      selectFields: ["*"],
      conditions: [{ field: "diet_id", operator: "=", value: 854 }]
    });
    
    if (dietResults.length > 0) {
      console.log("Diet Data (ID 854):");
      const dietData = dietResults[0];
      const slots = [
        'on_rising', 'breakfast', 'mid_morning', 'lunch', 'post_lunch',
        'tea_eve', 'pre_workout', 'post_workout', 'dinner', 'pre_dinner',
        'post_dinner', 'bed_time'
      ];
      slots.forEach(slot => {
        if (dietData[slot] && dietData[slot].includes('Buy')) {
          console.log(`\n--- SLOT: ${slot} ---`);
          console.log(dietData[slot]);
        }
      });
    } else {
      console.log("Diet 854 not found in specialDietPlan.");
    }
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}

run();

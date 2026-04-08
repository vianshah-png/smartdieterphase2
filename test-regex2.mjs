import { readRecord } from './src/config/query.js';

async function test() {
    try {
        const { results } = await readRecord({
            table: 'special_diet_plan',
            selectFields: ['on_rising', 'breakfast'],
            conditions: [{ field: "on_rising", operator: "LIKE", value: "%Order Now%" }],
            pagination: {limit: 1}
        });
        if (results.length) {
            console.log("--- ON RISING ---");
            console.log(results[0].on_rising);
        } else {
            console.log("No match found in special_diet_plan");
        }
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}

test();

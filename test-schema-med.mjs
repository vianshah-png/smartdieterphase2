import { readRecord } from './src/config/query.js';

async function test() {
    try {
        const res = await readRecord({
            table: 'assessment_medical_history', 
            selectFields: ['*'], 
            pagination: {limit: 1}
        });
        console.log("Medical Schema Columns:", Object.keys(res.results[0] || {}));
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}

test();

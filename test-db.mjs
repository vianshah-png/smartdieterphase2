import { readRecord } from './src/config/query.js';

async function test() {
    try {
        const res = await readRecord({
            table: 'countries', 
            selectFields: ['*'], 
            pagination: {limit: 1}
        });
        console.log("Country cols:", Object.keys(res.results[0] || {}));
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}

test();

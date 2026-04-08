import cron from 'node-cron';
import mysql from 'mysql2/promise';
import ApiLog from '../models/ApiLog.js';

// Configuration for your Mumbai server MariaDB instance
const mysqlConfig = {
    host: process.env.MYSQL_HOSTNAME,
    user: process.env.MYSQL_DATABASE_USER,
    password: process.env.MYSQL_DATABASE_PASSWORD,
    database: 'mysql' // Accessing system database for slow_log
};

const mysqlConfigLive = {
    host: process.env.MYSQL_HOSTNAME,
    user: process.env.MYSQL_DATABASE_USER,
    password: process.env.MYSQL_DATABASE_PASSWORD,
    database: 'balancei_nutweb' // Accessing system database for slow_log
};

cron.schedule('0 0 * * *', async () => {
    const currentDay = new Date().getDate();
    
    try {
        // 1. MySQL Slow Log Cleanup (Every 2 days)
        // if (currentDay % 2 === 0) {
            const connection = await mysql.createConnection(mysqlConfig);
            await connection.execute('TRUNCATE TABLE mysql.slow_log');
            await connection.end();
            const connectionLive = await mysql.createConnection(mysqlConfigLive);
            await connectionLive.execute('TRUNCATE TABLE balancei_nutweb.api_logs');
            await connectionLive.end();
            console.log("MySQL slow_log & diet_api_logs truncated successfully.");
        // }

        // 2. MongoDB ApiLog Cleanup (Older than 30 days)
        // Handled automatically if TTL index is set in the model
        
    } catch (err) {
        console.error("[Cleanup Cron Error]:", err);
    }
});
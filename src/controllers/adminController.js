import { exec } from 'child_process';
import checkDiskSpace from 'check-disk-space';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { writePool } from '../config/dbConnection.js'; // Using your existing writePool
import ApiLog from '../models/ApiLog.js'; // Ensure this model exists
import XLSX from "xlsx";
import axios from 'axios';


export const exportMongoLogs = async (req, res) => {
    try {
        const logs = await ApiLog.find().sort({ createdAt: -1 }).limit(100).lean();
        const worksheet = XLSX.utils.json_to_sheet(logs);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "SlowLogs");
        
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Disposition", "attachment; filename=Slow_Logs.xlsx");
        res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getMongoLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const isSlowOnly = req.query.slowOnly === 'true';

        // --- UPDATED: Use 2000ms (2 seconds) to match your new threshold ---
        const query = isSlowOnly ? { duration: { $gte: 2000 } } : {};

        const logs = await ApiLog.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await ApiLog.countDocuments(query);

        res.json({
            success: true,
            data: logs,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const truncateMongoLogs = async (req, res) => {
    try {
        // Deletes all records from the ApiLog collection in MongoDB
        await ApiLog.deleteMany({});
        res.json({ success: true, message: "MongoDB API logs cleared successfully." });
    } catch (err) {
        console.error("Mongo Delete Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const login = async (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        return res.json({ success: true });
    }
    res.status(401).json({ success: false, message: "Invalid Credentials" });
};

export const getServerResources = async (req, res) => {
    try {
        const rootPath = os.platform() === 'win32' ? 'C:' : '/';
        const disk = await checkDiskSpace(rootPath);
        
        // Fetch actual Slow Log status from MariaDB
        const [[slowLogVar]] = await writePool.execute("SHOW GLOBAL VARIABLES LIKE 'slow_query_log'");
        const slowLogStatus = slowLogVar ? slowLogVar.Value : "OFF";

        const filePath = path.join(process.cwd(), 'restart-status.json');
        let lastRestart = "Never";
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            lastRestart = data.lastRestart;
        }

        res.json({
            success: true,
            data: {
                cpu: (os.loadavg()[0]).toFixed(2) + "%",
                memory: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2) + "%",
                diskUsage: ((1 - disk.free / disk.size) * 100).toFixed(2) + "%",
                diskFreeGB: (disk.free / 1e9).toFixed(2) + " GB",
                uptime: Math.floor(os.uptime() / 3600) + "h",
                lastRestart: lastRestart,
                slowLogStatus: slowLogStatus // Added for dashboard visibility
            }
        });
    } catch (err) {
        console.error("Resource Fetch Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const exportSlowSqlLogs = async (req, res) => {
    try {
        // Fetch from the MariaDB system slow_log table
        const [rows] = await writePool.execute(
            'SELECT start_time, query_time, lock_time, rows_sent, rows_examined, db, sql_text FROM mysql.slow_log ORDER BY start_time DESC'
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "No slow logs found to export." });
        }

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Slow_SQL_Analysis");

        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        
        res.setHeader("Content-Disposition", "attachment; filename=Slow_SQL_Logs.xlsx");
        res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buffer);
    } catch (err) {
        console.error("Slow SQL Export Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const explainQuery = async (req, res) => {
    try {
        const { sql } = req.body;
        if (!sql) return res.status(400).json({ success: false, message: "No SQL provided" });

        // Run EXPLAIN to see how MariaDB handles the query
        const [plan] = await writePool.execute(`EXPLAIN ${sql}`);

        let suggestion = "Query looks optimized or uses existing indexes.";
        let severity = "low";

        // Logic to detect Full Table Scans
        const isFullScan = plan.some(p => p.type === 'ALL');
        if (isFullScan) {
            suggestion = "🚨 Full Table Scan detected! Consider adding an index to the columns in the WHERE clause.";
            severity = "high";
        }

        res.json({ success: true, suggestion, details: plan, severity });
    } catch (err) {
        console.error("Explain Error:", err.message);
        res.status(500).json({ success: false, error: "SQL Syntax Error or Permission Denied." });
    }
};

// Start logging slow queries
export const startSlowLog = async (req, res) => {
    try {
        await writePool.execute('SET GLOBAL slow_query_log = "ON"');
        await writePool.execute('SET GLOBAL long_query_time = 1'); // Log queries > 1 second
        res.json({ success: true, message: "SYSTEM_REPLY: SLOW_QUERY_LOG_ACTIVATED" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Stop logging slow queries
export const stopSlowLog = async (req, res) => {
    try {
        await writePool.execute('SET GLOBAL slow_query_log = "OFF"');
        res.json({ success: true, message: "SYSTEM_REPLY: SLOW_QUERY_LOG_DEACTIVATED" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
export const restartDocker = async (req, res) => {
    const { security_code } = req.body;
    
    if (security_code !== 'MAHI123') {
        return res.status(403).json({ success: false, message: "CRITICAL_ERROR: INVALID_SECURITY_CODE" });
    }
    const isProd = process.env.NODE_ENV === 'production';
    const containerName = isProd ? 'bn-new-apibalancenutritiononlinecom-node-2-1' : 'bn-20-api-node-2-1';
    
    console.log(`Restart Signal: ${containerName}`);

    // 1. Send the response to the dashboard immediately 
    // (If we wait for the restart, the connection will be severed)
    res.json({ success: true, message: "Restarting container... Dashboard will disconnect." });

    // 2. Small delay to allow the response and WhatsApp to fire before the 'kill' signal
    setTimeout(() => {
        exec(`docker restart ${containerName}`, async (error) => {
            if (error) {
                console.error("Exec Error:", error.message);
            }
        });
    }, 1000);

    // 3. Send WhatsApp alert in parallel
    try {
        await axios.post(`${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=919773383276`, {
            template_name: "server_status_alert_",
            broadcast_name: "admin_restart",
            parameters: [
                { name: "name", value: "Vikram" },
                { name: "server_name", value: containerName },
                { name: "status", value: "RESTARTING" },
                { name: "time", value: new Date().toLocaleString('en-IN') },
                { name: "env", value: isProd ? "Production" : "Local" }
            ]
        });
    } catch (e) {
        console.error("WA Alert Failed", e.message);
    }
};

export const truncateSlowLogs = async (req, res) => {
    try {
        // Execute the truncate command using the writePool
        await writePool.execute('TRUNCATE TABLE mysql.slow_log');
        res.json({ success: true, message: "Slow query logs cleared successfully." });
    } catch (err) {
        console.error("Truncate Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const truncateApiLogs = async (req, res) => {
    try {
        // Truncates the api_logs table shown in your database schema
        await writePool.execute('TRUNCATE TABLE api_logs');
        res.json({ success: true, message: "API logs cleared successfully." });
    } catch (err) {
        console.error("Truncate API Logs Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getSlowQueries = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        // Fetch paginated logs
        const [rows] = await writePool.execute(
            `SELECT start_time, query_time, sql_text 
             FROM mysql.slow_log 
             ORDER BY start_time DESC 
             LIMIT ? OFFSET ?`, 
            [limit.toString(), offset.toString()]
        );

        // Get total count for pagination controls
        const [[{ total }]] = await writePool.execute('SELECT COUNT(*) as total FROM mysql.slow_log');

        res.json({ 
            success: true, 
            data: rows, 
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};



export const logout = (req, res) => {
    req.session.destroy();
    res.redirect('/api/v1/admin/login');
};
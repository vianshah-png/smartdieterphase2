import axios from "axios";
import ApiLog from "../models/ApiLog.js";
import { sendMailUtil } from "../utils/sendEmail.js";

// --- BATCHING & RATE LIMIT CONFIG ---
let logBuffer = [];
const BATCH_INTERVAL = 2000; 
const MAX_BUFFER_SIZE = 500; 
const alertCache = new Map(); 
const ALERT_COOLDOWN = 10 * 60 * 1000; 

const startFlusher = (io) => {
    if (global.perfFlusherStarted) return;
    setInterval(() => {
        if (logBuffer.length > 0) {
            io.emit('api-batch', { 
                logs: [...logBuffer], 
                timestamp: new Date().toLocaleTimeString('en-IN') 
            });
            logBuffer = []; 
        }
    }, BATCH_INTERVAL);
    global.perfFlusherStarted = true;
};

export const perfLogger = (io) => {
    startFlusher(io);

    return (req, res, next) => {
        if (req.originalUrl.startsWith('/api/v1/admin/') || req.originalUrl.startsWith('/api/v1/event/start-event')) {
            return next();
        }
        const start = process.hrtime();

        res.on('finish', () => {
            const diff = process.hrtime(start);
            const duration = parseFloat((diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2));
            const isSlow = duration >= 2000; 

            // Basic log for the live dashboard batch
            const logData = {
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                duration,
                isSlow
            };

            if (logBuffer.length < MAX_BUFFER_SIZE) {
                logBuffer.push(logData);
            }

            // Persistence and Alerts
            if (isSlow || res.statusCode >= 500) {
                // Generate CURL once for both DB storage and potential Email/WA alerts
                const curlCommand = generateCurl(req);

                setImmediate(async () => {
                    try {
                        // Include CURL in the data saved to MongoDB
                        await ApiLog.create({
                            ...logData,
                            curl: curlCommand 
                        });
                        
                        if (res.statusCode >= 500) {
                            const errorCount = await ApiLog.countDocuments({
                                url: req.originalUrl,
                                status: { $gte: 500 },
                                createdAt: { $gte: new Date(Date.now() - 3600000) }
                            });

                            const now = Date.now();
                            const lastAlertTime = alertCache.get(req.originalUrl) || 0;

                            if (errorCount >= 5 && (now - lastAlertTime > ALERT_COOLDOWN)) {
                                alertCache.set(req.originalUrl, now);
                                
                                sendMailUtil({
                                    from: "support@balancenutrition.in",
                                    to: "vikram.gupta@balancenutrition.in",
                                    cc: ["vaibhav.gonjari@balancenutrition.in", "madhukumar.paka@balancenutrition.in", "testerteam@balancenutrition.in"],
                                    subject: `🚨 CRITICAL: API Crash Time ${new Date().toLocaleString('en-IN')}`,
                                    html: `
                                        <div style="font-family: sans-serif; color: #333;">
                                            <h2 style="color: #d9534f;">API Failure Alert (Rate Limited)</h2>
                                            <p>Endpoint <b>${req.originalUrl}</b> failed <b>${errorCount}</b> times recently.</p>
                                            <hr/>
                                            <p><b>CURL:</b></p>
                                            <pre style="background: #f4f4f4; padding: 10px; color: #c7254e; overflow-x: auto;">${curlCommand}</pre>
                                        </div>`
                                }).catch(e => console.error("Email Alert Failed", e.message));

                                axios.post(`${process.env.BACKEND_URL}/api/v1/wati/send-message-template?whatsappNumber=919773383276`, {
                                    template_name: "server_status_alert_500",
                                    broadcast_name: "admin_restart_500",
                                    parameters: [
                                        { name: "name", value: "Vikram" },
                                        { name: "endpoint", value: req.originalUrl },
                                        { name: "count", value: errorCount.toString() }                
                                    ]
                                }).catch(e => console.error("WA Alert Failed", e.message));
                            }
                        }
                    } catch (err) { console.error("Background Logger error:", err.message); }
                });
            }
        });
        next();
    };
};

const generateCurl = (req) => {
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    let curl = `curl -X ${req.method} "${fullUrl}"`;
    Object.keys(req.headers).forEach(key => {
        curl += ` \\\n  -H "${key}: ${req.headers[key]}"`;
    });
    if (req.body && Object.keys(req.body).length > 0) {
        curl += ` \\\n  -d '${JSON.stringify(req.body)}'`;
    }
    return curl;
};
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as adminController from '../controllers/adminController.js'; 
import { isAdmin } from '../middlewares/authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// Ensure these functions exist in the controller file
router.get('/', (req, res) => res.redirect('/api/v1/admin/login'));
router.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../views/login.html')));
router.post('/login', adminController.login); // Mapped to export const login
router.post('/truncate-mongo-logs', isAdmin, adminController.truncateMongoLogs);
router.get('/mongo-logs', isAdmin, adminController.getMongoLogs);
router.post('/truncate-slow-logs', isAdmin, adminController.truncateSlowLogs);
router.post('/truncate-api-logs', isAdmin, adminController.truncateApiLogs);
router.get('/monitor', isAdmin, (req, res) => res.sendFile(path.join(__dirname, '../views/monitor.html')));
router.get('/server-resources', isAdmin, adminController.getServerResources);
router.get('/slow-queries', isAdmin, adminController.getSlowQueries);
router.post('/restart-docker', isAdmin, adminController.restartDocker);
router.post('/explain-query', isAdmin, adminController.explainQuery);
router.get('/export-slow-sql', isAdmin, adminController.exportSlowSqlLogs);
router.get('/export-mongo-logs', isAdmin, adminController.exportMongoLogs);
router.post('/start-slow-log', isAdmin, adminController.startSlowLog);
router.post('/stop-slow-log', isAdmin, adminController.stopSlowLog);
router.get('/logout', adminController.logout);

export default router;
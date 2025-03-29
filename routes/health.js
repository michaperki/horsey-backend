// Create a new file: routes/healthRoutes.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

/**
 * Basic health check endpoint - publicly accessible
 * GET /health
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'chess-betting-api'
  });
});

/**
 * Detailed health check endpoint - restricted to admins
 * GET /health/detailed
 */
router.get('/detailed', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    // Check database connection
    const dbStatus = {
      connected: mongoose.connection.readyState === 1,
      state: getConnectionStateName(mongoose.connection.readyState)
    };

    // Get system information
    const systemInfo = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      cpuUsage: process.cpuUsage()
    };

    // Check available disk space (simplified)
    const diskInfo = {
      free: 'Not implemented', // Would require additional package like 'diskusage'
      total: 'Not implemented'
    };

    // Combine all checks
    const healthData = {
      status: dbStatus.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'chess-betting-api',
      version: process.env.npm_package_version || 'unknown',
      database: dbStatus,
      system: systemInfo,
      disk: diskInfo
    };

    res.status(200).json(healthData);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      message: 'Error performing health check',
      error: error.message
    });
  }
});

/**
 * Helper function to convert Mongoose connection state code to name
 */
function getConnectionStateName(state) {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    4: 'invalid',
    99: 'uninitialized'
  };
  return states[state] || 'unknown';
}

module.exports = router;

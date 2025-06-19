const express = require('express');
const router = express.Router();
const usageMeteringService = require('../services/usageMetering');
const billingWorker = require('../services/billingWorker');
const redisService = require('../services/redis');
const { body, validationResult } = require('express-validator');

/**
 * Get usage statistics for current user
 * GET /api/usage/user
 */
router.get('/user', async (req, res) => {
    try {
        const { period = '24h' } = req.query;
        const userId = req.user.id;

        const usage = await usageMeteringService.getUserUsage(userId, period);

        res.json({
            success: true,
            period,
            usage
        });
    } catch (error) {
        console.error('Error getting user usage:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get usage statistics',
            error: error.message
        });
    }
});

/**
 * Get usage statistics for specific API
 * GET /api/usage/api/:apiId
 */
router.get('/api/:apiId', async (req, res) => {
    try {
        const { period = '24h' } = req.query;
        const { apiId } = req.params;

        const usage = await usageMeteringService.getApiUsage(apiId, period);

        res.json({
            success: true,
            apiId,
            period,
            usage
        });
    } catch (error) {
        console.error('Error getting API usage:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get API usage statistics',
            error: error.message
        });
    }
});

/**
 * Get real-time metrics
 * GET /api/usage/metrics
 */
router.get('/metrics', async (req, res) => {
    try {
        const { userId, apiId } = req.query;

        if (!userId || !apiId) {
            return res.status(400).json({
                success: false,
                message: 'userId and apiId are required'
            });
        }

        const key = `metrics:${userId}:${apiId}`;
        const metrics = await redisService.redis.hgetall(key);

        // Convert string values to numbers
        const formattedMetrics = {};
        for (const [key, value] of Object.entries(metrics)) {
            if (key === 'cost') {
                formattedMetrics[key] = parseInt(value) / 1000000; // Convert back from micro-cents
            } else {
                formattedMetrics[key] = parseInt(value);
            }
        }

        res.json({
            success: true,
            userId,
            apiId,
            metrics: formattedMetrics
        });
    } catch (error) {
        console.error('Error getting real-time metrics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get real-time metrics',
            error: error.message
        });
    }
});

/**
 * Get billing worker status
 * GET /api/usage/worker/status
 */
router.get('/worker/status', async (req, res) => {
    try {
        const status = billingWorker.getStatus();
        const redisHealth = await redisService.healthCheck();

        res.json({
            success: true,
            worker: status,
            redis: redisHealth
        });
    } catch (error) {
        console.error('Error getting worker status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get worker status',
            error: error.message
        });
    }
});

/**
 * Start billing worker
 * POST /api/usage/worker/start
 */
router.post('/worker/start', async (req, res) => {
    try {
        await billingWorker.start();

        res.json({
            success: true,
            message: 'Billing worker started successfully'
        });
    } catch (error) {
        console.error('Error starting billing worker:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start billing worker',
            error: error.message
        });
    }
});

/**
 * Stop billing worker
 * POST /api/usage/worker/stop
 */
router.post('/worker/stop', async (req, res) => {
    try {
        billingWorker.stop();

        res.json({
            success: true,
            message: 'Billing worker stopped successfully'
        });
    } catch (error) {
        console.error('Error stopping billing worker:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop billing worker',
            error: error.message
        });
    }
});

/**
 * Get usage health check
 * GET /api/usage/health
 */
router.get('/health', async (req, res) => {
    try {
        const health = await usageMeteringService.healthCheck();
        res.json({
            success: true,
            health
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Usage health check failed',
            error: error.message
        });
    }
});

module.exports = router; 
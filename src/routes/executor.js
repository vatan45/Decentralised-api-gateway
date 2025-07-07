const express = require('express');
const router = express.Router();
const runtimeExecutor = require('../services/runtimeExecutor');
const Api = require('../models/Api');
const { body, validationResult } = require('express-validator');
const { trackUsage } = require('../middleware/usageMetering');

/**
 * Execute an API by ID
 * POST /api/executor/:apiId
 */
router.post('/:apiId', [
    body('method').optional().isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    body('headers').optional().isObject(),
    body('body').optional(),
    body('query').optional().isObject()
], trackUsage, async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { apiId } = req.params;
        const { method = 'GET', headers = {}, body = {}, query = {} } = req.body;

        // Find API in database
        const api = await Api.findById(apiId);
        if (!api) {
            return res.status(404).json({
                success: false,
                message: 'API not found'
            });
        }

        // Get current version
        const currentVersion = api.versions.find(v => v.version === api.currentVersion);
        if (!currentVersion) {
            return res.status(400).json({
                success: false,
                message: 'No valid version found for this API'
            });
        }

        // Set API and user info for usage tracking
        req.apiId = apiId;
        req.userId = req.user ? req.user.id : 'anonymous';

        // Prepare request data for execution
        const requestData = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body,
            query,
            url: req.originalUrl,
            timestamp: new Date().toISOString()
        };

        // Execute API
        const result = await runtimeExecutor.executeApi(currentVersion.code, requestData);

        // Set execution ID for usage tracking
        req.executionId = result.executionId;

        // Return execution result
        res.json({
            success: true,
            apiId,
            apiName: api.name,
            version: api.currentVersion,
            execution: result
        });

    } catch (error) {
        console.error('API execution error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to execute API',
            error: error.message
        });
    }
});

/**
 * Execute an API by IPFS hash directly
 * POST /api/executor/hash/:ipfsHash
 */
router.post('/hash/:ipfsHash', [
    body('method').optional().isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    body('headers').optional().isObject(),
    body('body').optional(),
    body('query').optional().isObject()
], async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { ipfsHash } = req.params;
        const { method = 'GET', headers = {}, body = {}, query = {} } = req.body;

        // Prepare request data
        const requestData = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body,
            query,
            url: req.originalUrl,
            timestamp: new Date().toISOString()
        };

        // Execute API directly from IPFS hash
        const result = await runtimeExecutor.executeApi(ipfsHash, requestData);

        res.json({
            success: true,
            ipfsHash,
            execution: result
        });

    } catch (error) {
        console.error('Direct API execution error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to execute API',
            error: error.message
        });
    }
});

/**
 * Get runtime executor health status
 * GET /api/executor/health
 */
router.get('/health', async (req, res) => {
    try {
        const health = await runtimeExecutor.healthCheck();
        res.json({
            success: true,
            health
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Health check failed',
            error: error.message
        });
    }
});

/**
 * Get runtime executor statistics
 * GET /api/executor/stats
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await runtimeExecutor.getStats();
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to get runtime stats',
            error: error.message
        });
    }
});

module.exports = router; 
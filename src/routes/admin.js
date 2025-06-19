const express = require('express');
const router = express.Router();
const adminService = require('../services/adminService');
const { body, validationResult } = require('express-validator');

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }
    next();
};

/**
 * Get dashboard statistics
 * GET /api/admin/dashboard
 */
router.get('/dashboard', requireAdmin, async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        const stats = await adminService.getDashboardStats(period);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get dashboard statistics',
            error: error.message
        });
    }
});

/**
 * Get user analytics
 * GET /api/admin/users/:userId/analytics
 */
router.get('/users/:userId/analytics', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { period = '30d' } = req.query;

        const analytics = await adminService.getUserAnalytics(userId, period);

        res.json({
            success: true,
            data: analytics
        });
    } catch (error) {
        console.error('Error getting user analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user analytics',
            error: error.message
        });
    }
});

/**
 * Get revenue analytics
 * GET /api/admin/revenue
 */
router.get('/revenue', requireAdmin, async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        const analytics = await adminService.getRevenueAnalytics(period);

        res.json({
            success: true,
            data: analytics
        });
    } catch (error) {
        console.error('Error getting revenue analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get revenue analytics',
            error: error.message
        });
    }
});

/**
 * Block/Unblock API
 * POST /api/admin/apis/:apiId/block
 */
router.post('/apis/:apiId/block', requireAdmin, [
    body('blocked').isBoolean(),
    body('reason').optional().isString().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { apiId } = req.params;
        const { blocked, reason = '' } = req.body;

        const result = await adminService.toggleApiBlock(apiId, blocked, req.user.id, reason);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error blocking API:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to block API',
            error: error.message
        });
    }
});

/**
 * Suspend/Unsuspend User
 * POST /api/admin/users/:userId/suspend
 */
router.post('/users/:userId/suspend', requireAdmin, [
    body('suspended').isBoolean(),
    body('reason').optional().isString().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { userId } = req.params;
        const { suspended, reason = '' } = req.body;

        const result = await adminService.toggleUserSuspension(userId, suspended, req.user.id, reason);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error suspending user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to suspend user',
            error: error.message
        });
    }
});

/**
 * Get abuse reports
 * GET /api/admin/abuse-reports
 */
router.get('/abuse-reports', requireAdmin, async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            priority: req.query.priority,
            targetType: req.query.targetType,
            limit: parseInt(req.query.limit) || 50
        };

        const reports = await adminService.getAbuseReports(filters);

        res.json({
            success: true,
            data: reports
        });
    } catch (error) {
        console.error('Error getting abuse reports:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get abuse reports',
            error: error.message
        });
    }
});

/**
 * Update abuse report
 * PUT /api/admin/abuse-reports/:reportId
 */
router.put('/abuse-reports/:reportId', requireAdmin, [
    body('status').optional().isIn(['PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    body('assignedTo').optional().isMongoId(),
    body('resolution').optional().isObject()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { reportId } = req.params;
        const updates = req.body;

        const report = await adminService.updateAbuseReport(reportId, updates, req.user.id);

        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Error updating abuse report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update abuse report',
            error: error.message
        });
    }
});

/**
 * Get system logs
 * GET /api/admin/logs/system
 */
router.get('/logs/system', requireAdmin, async (req, res) => {
    try {
        const filters = {
            level: req.query.level,
            category: req.query.category,
            userId: req.query.userId,
            apiId: req.query.apiId,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            limit: parseInt(req.query.limit) || 100
        };

        const logs = await adminService.getSystemLogs(filters);

        res.json({
            success: true,
            data: logs
        });
    } catch (error) {
        console.error('Error getting system logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get system logs',
            error: error.message
        });
    }
});

/**
 * Get admin logs
 * GET /api/admin/logs/admin
 */
router.get('/logs/admin', requireAdmin, async (req, res) => {
    try {
        const filters = {
            action: req.query.action,
            adminId: req.query.adminId,
            targetType: req.query.targetType,
            severity: req.query.severity,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            limit: parseInt(req.query.limit) || 100
        };

        const logs = await adminService.getAdminLogs(filters);

        res.json({
            success: true,
            data: logs
        });
    } catch (error) {
        console.error('Error getting admin logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get admin logs',
            error: error.message
        });
    }
});

module.exports = router;

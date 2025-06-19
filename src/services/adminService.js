const User = require('../models/User');
const Api = require('../models/Api');
const UsageLog = require('../models/UsageLog');
const UsageSnapshot = require('../models/UsageSnapshot');
const AdminLog = require('../models/AdminLog');
const SystemLog = require('../models/SystemLog');
const AbuseReport = require('../models/AbuseReport');

class AdminService {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get comprehensive dashboard statistics
     */
    async getDashboardStats(period = '30d') {
        try {
            const startDate = this.getStartDate(period);

            const [
                totalUsers,
                totalApis,
                totalRequests,
                totalRevenue,
                activeUsers,
                activeApis,
                errorRate,
                abuseReports
            ] = await Promise.all([
                User.countDocuments({ createdAt: { $gte: startDate } }),
                Api.countDocuments({ createdAt: { $gte: startDate } }),
                UsageLog.countDocuments({ timestamp: { $gte: startDate } }),
                UsageLog.aggregate([
                    { $match: { timestamp: { $gte: startDate } } },
                    { $group: { _id: null, total: { $sum: '$cost' } } }
                ]),
                UsageLog.distinct('userId', { timestamp: { $gte: startDate } }),
                UsageLog.distinct('apiId', { timestamp: { $gte: startDate } }),
                this.calculateErrorRate(startDate),
                AbuseReport.countDocuments({ status: 'PENDING' })
            ]);

            return {
                totalUsers: totalUsers,
                totalApis: totalApis,
                totalRequests: totalRequests,
                totalRevenue: totalRevenue[0]?.total || 0,
                activeUsers: activeUsers.length,
                activeApis: activeApis.length,
                errorRate: errorRate,
                pendingAbuseReports: abuseReports,
                period: period
            };
        } catch (error) {
            console.error('Error getting dashboard stats:', error);
            throw error;
        }
    }

    /**
     * Get user analytics
     */
    async getUserAnalytics(userId, period = '30d') {
        try {
            const startDate = this.getStartDate(period);

            const usage = await UsageLog.aggregate([
                {
                    $match: {
                        userId: new require('mongoose').Types.ObjectId(userId),
                        timestamp: { $gte: startDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                        },
                        requests: { $sum: 1 },
                        revenue: { $sum: '$cost' },
                        errors: {
                            $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] }
                        },
                        avgDuration: { $avg: '$duration' }
                    }
                },
                { $sort: { '_id': 1 } }
            ]);

            const apiUsage = await UsageLog.aggregate([
                {
                    $match: {
                        userId: new require('mongoose').Types.ObjectId(userId),
                        timestamp: { $gte: startDate }
                    }
                },
                {
                    $group: {
                        _id: '$apiId',
                        requests: { $sum: 1 },
                        revenue: { $sum: '$cost' },
                        errors: {
                            $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] }
                        }
                    }
                },
                {
                    $lookup: {
                        from: 'apis',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'api'
                    }
                },
                { $unwind: '$api' }
            ]);

            return {
                dailyUsage: usage,
                apiUsage: apiUsage,
                period: period
            };
        } catch (error) {
            console.error('Error getting user analytics:', error);
            throw error;
        }
    }

    /**
     * Get revenue analytics
     */
    async getRevenueAnalytics(period = '30d') {
        try {
            const startDate = this.getStartDate(period);

            const dailyRevenue = await UsageLog.aggregate([
                {
                    $match: { timestamp: { $gte: startDate } }
                },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                        },
                        revenue: { $sum: '$cost' },
                        requests: { $sum: 1 }
                    }
                },
                { $sort: { '_id': 1 } }
            ]);

            const apiRevenue = await UsageLog.aggregate([
                {
                    $match: { timestamp: { $gte: startDate } }
                },
                {
                    $group: {
                        _id: '$apiId',
                        revenue: { $sum: '$cost' },
                        requests: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: 'apis',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'api'
                    }
                },
                { $unwind: '$api' },
                { $sort: { revenue: -1 } },
                { $limit: 10 }
            ]);

            const userRevenue = await UsageLog.aggregate([
                {
                    $match: { timestamp: { $gte: startDate } }
                },
                {
                    $group: {
                        _id: '$userId',
                        revenue: { $sum: '$cost' },
                        requests: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                { $unwind: '$user' },
                { $sort: { revenue: -1 } },
                { $limit: 10 }
            ]);

            return {
                dailyRevenue: dailyRevenue,
                topApis: apiRevenue,
                topUsers: userRevenue,
                period: period
            };
        } catch (error) {
            console.error('Error getting revenue analytics:', error);
            throw error;
        }
    }

    /**
     * Block/Unblock API
     */
    async toggleApiBlock(apiId, blocked, adminId, reason = '') {
        try {
            const api = await Api.findById(apiId);
            if (!api) {
                throw new Error('API not found');
            }

            api.isBlocked = blocked;
            api.blockedAt = blocked ? new Date() : null;
            api.blockedBy = blocked ? adminId : null;
            api.blockReason = blocked ? reason : null;

            await api.save();

            // Log admin action
            await this.logAdminAction({
                action: blocked ? 'API_BLOCKED' : 'API_UNBLOCKED',
                adminId,
                targetType: 'API',
                targetId: apiId,
                targetModel: 'Api',
                details: { reason, blocked },
                severity: blocked ? 'HIGH' : 'MEDIUM'
            });

            return {
                success: true,
                message: `API ${blocked ? 'blocked' : 'unblocked'} successfully`,
                api
            };
        } catch (error) {
            console.error('Error toggling API block:', error);
            throw error;
        }
    }

    /**
     * Suspend/Unsuspend User
     */
    async toggleUserSuspension(userId, suspended, adminId, reason = '') {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            user.isSuspended = suspended;
            user.suspendedAt = suspended ? new Date() : null;
            user.suspendedBy = suspended ? adminId : null;
            user.suspensionReason = suspended ? reason : null;

            await user.save();

            // Log admin action
            await this.logAdminAction({
                action: suspended ? 'USER_SUSPENDED' : 'USER_UNSUSPENDED',
                adminId,
                targetType: 'USER',
                targetId: userId,
                targetModel: 'User',
                details: { reason, suspended },
                severity: suspended ? 'HIGH' : 'MEDIUM'
            });

            return {
                success: true,
                message: `User ${suspended ? 'suspended' : 'unsuspended'} successfully`,
                user
            };
        } catch (error) {
            console.error('Error toggling user suspension:', error);
            throw error;
        }
    }

    /**
     * Get abuse reports
     */
    async getAbuseReports(filters = {}) {
        try {
            const query = {};

            if (filters.status) query.status = filters.status;
            if (filters.priority) query.priority = filters.priority;
            if (filters.targetType) query.targetType = filters.targetType;

            const reports = await AbuseReport.find(query)
                .populate('reporterId', 'name email')
                .populate('targetId')
                .populate('assignedTo', 'name email')
                .populate('resolution.resolvedBy', 'name email')
                .sort({ priority: -1, timestamp: -1 })
                .limit(filters.limit || 50);

            return reports;
        } catch (error) {
            console.error('Error getting abuse reports:', error);
            throw error;
        }
    }

    /**
     * Update abuse report status
     */
    async updateAbuseReport(reportId, updates, adminId) {
        try {
            const report = await AbuseReport.findById(reportId);
            if (!report) {
                throw new Error('Abuse report not found');
            }

            Object.assign(report, updates);

            if (updates.status === 'RESOLVED' && updates.resolution) {
                report.resolution.resolvedBy = adminId;
                report.resolution.resolvedAt = new Date();
            }

            await report.save();

            // Log admin action
            await this.logAdminAction({
                action: 'ABUSE_FLAGGED',
                adminId,
                targetType: 'GENERAL',
                details: { reportId, updates },
                severity: 'MEDIUM'
            });

            return report;
        } catch (error) {
            console.error('Error updating abuse report:', error);
            throw error;
        }
    }

    /**
     * Get system logs
     */
    async getSystemLogs(filters = {}) {
        try {
            const query = {};

            if (filters.level) query.level = filters.level;
            if (filters.category) query.category = filters.category;
            if (filters.userId) query.userId = filters.userId;
            if (filters.apiId) query.apiId = filters.apiId;
            if (filters.startDate) {
                query.timestamp = { $gte: new Date(filters.startDate) };
            }
            if (filters.endDate) {
                query.timestamp = { ...query.timestamp, $lte: new Date(filters.endDate) };
            }

            const logs = await SystemLog.find(query)
                .populate('userId', 'name email')
                .populate('apiId', 'name')
                .sort({ timestamp: -1 })
                .limit(filters.limit || 100);

            return logs;
        } catch (error) {
            console.error('Error getting system logs:', error);
            throw error;
        }
    }

    /**
     * Get admin logs
     */
    async getAdminLogs(filters = {}) {
        try {
            const query = {};

            if (filters.action) query.action = filters.action;
            if (filters.adminId) query.adminId = filters.adminId;
            if (filters.targetType) query.targetType = filters.targetType;
            if (filters.severity) query.severity = filters.severity;
            if (filters.startDate) {
                query.timestamp = { $gte: new Date(filters.startDate) };
            }
            if (filters.endDate) {
                query.timestamp = { ...query.timestamp, $lte: new Date(filters.endDate) };
            }

            const logs = await AdminLog.find(query)
                .populate('adminId', 'name email')
                .populate('targetId')
                .sort({ timestamp: -1 })
                .limit(filters.limit || 100);

            return logs;
        } catch (error) {
            console.error('Error getting admin logs:', error);
            throw error;
        }
    }

    /**
     * Log admin action
     */
    async logAdminAction(logData) {
        try {
            const adminLog = new AdminLog(logData);
            await adminLog.save();
        } catch (error) {
            console.error('Error logging admin action:', error);
        }
    }

    /**
     * Log system event
     */
    async logSystemEvent(level, category, message, details = {}) {
        try {
            const systemLog = new SystemLog({
                level,
                category,
                message,
                details
            });
            await systemLog.save();
        } catch (error) {
            console.error('Error logging system event:', error);
        }
    }

    /**
     * Calculate error rate
     */
    async calculateErrorRate(startDate) {
        try {
            const [totalRequests, errorRequests] = await Promise.all([
                UsageLog.countDocuments({ timestamp: { $gte: startDate } }),
                UsageLog.countDocuments({
                    timestamp: { $gte: startDate },
                    statusCode: { $gte: 400 }
                })
            ]);

            return totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;
        } catch (error) {
            console.error('Error calculating error rate:', error);
            return 0;
        }
    }

    /**
     * Get start date based on period
     */
    getStartDate(period) {
        const now = new Date();
        switch (period) {
            case '1d':
                return new Date(now.getTime() - 24 * 60 * 60 * 1000);
            case '7d':
                return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            case '30d':
                return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            case '90d':
                return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            default:
                return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
    }
}

module.exports = new AdminService(); 
const UsageLog = require('../models/UsageLog');
const UsageSnapshot = require('../models/UsageSnapshot');
const redisService = require('./redis');
const Api = require('../models/Api');

class UsageMeteringService {
    constructor() {
        this.pricingCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Log API usage and push to Redis stream
     */
    async logUsage(usageData) {
        try {
            // Calculate request size
            const bytesIn = this.calculateRequestSize(usageData.request);
            const bytesOut = this.calculateResponseSize(usageData.response);

            // Get API pricing
            const pricing = await this.getApiPricing(usageData.apiId);

            // Calculate cost
            const cost = this.calculateCost(pricing, usageData.duration, bytesIn, bytesOut);

            const logData = {
                apiId: usageData.apiId,
                userId: usageData.userId,
                endpoint: usageData.endpoint,
                method: usageData.method,
                timestamp: new Date(),
                duration: usageData.duration,
                bytesIn,
                bytesOut,
                statusCode: usageData.statusCode,
                ipAddress: usageData.ipAddress,
                userAgent: usageData.userAgent,
                apiKey: usageData.apiKey,
                executionId: usageData.executionId,
                cost,
                metadata: {
                    pricing,
                    userAgent: usageData.userAgent,
                    ipAddress: usageData.ipAddress
                }
            };

            // Save to database
            const usageLog = new UsageLog(logData);
            await usageLog.save();

            // Push to Redis stream for real-time processing
            await redisService.addUsageLog(logData);

            console.log(`Usage logged: API ${usageData.apiId}, User ${usageData.userId}, Cost: $${cost}`);

            return usageLog;
        } catch (error) {
            console.error('Error logging usage:', error);
            throw error;
        }
    }

    /**
     * Calculate request size in bytes
     */
    calculateRequestSize(request) {
        let size = 0;

        if (request.url) size += Buffer.byteLength(request.url, 'utf8');
        if (request.method) size += Buffer.byteLength(request.method, 'utf8');
        if (request.headers) {
            size += Buffer.byteLength(JSON.stringify(request.headers), 'utf8');
        }
        if (request.body) {
            size += Buffer.byteLength(JSON.stringify(request.body), 'utf8');
        }
        if (request.query) {
            size += Buffer.byteLength(JSON.stringify(request.query), 'utf8');
        }

        return size;
    }

    /**
     * Calculate response size in bytes
     */
    calculateResponseSize(response) {
        if (!response) return 0;

        let size = 0;
        if (response.headers) {
            size += Buffer.byteLength(JSON.stringify(response.headers), 'utf8');
        }
        if (response.body) {
            size += Buffer.byteLength(JSON.stringify(response.body), 'utf8');
        }

        return size;
    }

    /**
     * Get API pricing from cache or database
     */
    async getApiPricing(apiId) {
        const cacheKey = `pricing:${apiId}`;
        const cached = this.pricingCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.pricing;
        }

        try {
            const api = await Api.findById(apiId).select('endpoints');
            if (!api) {
                throw new Error(`API ${apiId} not found`);
            }

            const pricing = {
                basePrice: 0.001, // $0.001 per request
                durationPrice: 0.0001, // $0.0001 per ms
                dataPrice: 0.000001 // $0.000001 per byte
            };

            // Cache the pricing
            this.pricingCache.set(cacheKey, {
                pricing,
                timestamp: Date.now()
            });

            return pricing;
        } catch (error) {
            console.error('Error getting API pricing:', error);
            return {
                basePrice: 0.001,
                durationPrice: 0.0001,
                dataPrice: 0.000001
            };
        }
    }

    /**
     * Calculate cost based on pricing and usage
     */
    calculateCost(pricing, duration, bytesIn, bytesOut) {
        const baseCost = pricing.basePrice;
        const durationCost = (duration / 1000) * pricing.durationPrice; // Convert ms to seconds
        const dataCost = ((bytesIn + bytesOut) / 1024) * pricing.dataPrice; // Convert bytes to KB

        return Math.round((baseCost + durationCost + dataCost) * 1000000) / 1000000; // Round to 6 decimal places
    }

    /**
     * Get usage statistics for a user
     */
    async getUserUsage(userId, period = '24h') {
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
                        _id: '$apiId',
                        totalRequests: { $sum: 1 },
                        totalDuration: { $sum: '$duration' },
                        totalBytesIn: { $sum: '$bytesIn' },
                        totalBytesOut: { $sum: '$bytesOut' },
                        totalCost: { $sum: '$cost' },
                        averageDuration: { $avg: '$duration' },
                        errorCount: {
                            $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] }
                        },
                        successCount: {
                            $sum: { $cond: [{ $lt: ['$statusCode', 400] }, 1, 0] }
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
                {
                    $unwind: '$api'
                },
                {
                    $project: {
                        apiId: '$_id',
                        apiName: '$api.name',
                        totalRequests: 1,
                        totalDuration: 1,
                        totalBytesIn: 1,
                        totalBytesOut: 1,
                        totalCost: 1,
                        averageDuration: 1,
                        errorCount: 1,
                        successCount: 1
                    }
                }
            ]);

            return usage;
        } catch (error) {
            console.error('Error getting user usage:', error);
            throw error;
        }
    }

    /**
     * Get usage statistics for an API
     */
    async getApiUsage(apiId, period = '24h') {
        try {
            const startDate = this.getStartDate(period);

            const usage = await UsageLog.aggregate([
                {
                    $match: {
                        apiId: new require('mongoose').Types.ObjectId(apiId),
                        timestamp: { $gte: startDate }
                    }
                },
                {
                    $group: {
                        _id: '$userId',
                        totalRequests: { $sum: 1 },
                        totalDuration: { $sum: '$duration' },
                        totalBytesIn: { $sum: '$bytesIn' },
                        totalBytesOut: { $sum: '$bytesOut' },
                        totalCost: { $sum: '$cost' },
                        averageDuration: { $avg: '$duration' },
                        errorCount: {
                            $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] }
                        },
                        successCount: {
                            $sum: { $cond: [{ $lt: ['$statusCode', 400] }, 1, 0] }
                        }
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
                {
                    $unwind: '$user'
                },
                {
                    $project: {
                        userId: '$_id',
                        userName: '$user.name',
                        userEmail: '$user.email',
                        totalRequests: 1,
                        totalDuration: 1,
                        totalBytesIn: 1,
                        totalBytesOut: 1,
                        totalCost: 1,
                        averageDuration: 1,
                        errorCount: 1,
                        successCount: 1
                    }
                }
            ]);

            return usage;
        } catch (error) {
            console.error('Error getting API usage:', error);
            throw error;
        }
    }

    /**
     * Get start date based on period
     */
    getStartDate(period) {
        const now = new Date();
        switch (period) {
            case '1h':
                return new Date(now.getTime() - 60 * 60 * 1000);
            case '24h':
                return new Date(now.getTime() - 24 * 60 * 60 * 1000);
            case '7d':
                return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            case '30d':
                return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            default:
                return new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const redisHealth = await redisService.healthCheck();
            return {
                status: 'healthy',
                redis: redisHealth,
                database: 'connected'
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }
}

module.exports = new UsageMeteringService();
const UsageSnapshot = require('../models/UsageSnapshot');
const redisService = require('./redis');
const UsageLog = require('../models/UsageLog');

class BillingWorker {
    constructor() {
        this.groupName = 'billing_worker';
        this.consumerName = 'worker_1';
        this.isRunning = false;
        this.batchSize = 100;
        this.processingInterval = 5000; // 5 seconds
    }

    /**
     * Start the billing worker
     */
    async start() {
        if (this.isRunning) {
            console.log('Billing worker is already running');
            return;
        }

        try {
            // Create consumer group
            await redisService.createConsumerGroup(this.groupName, this.consumerName);

            this.isRunning = true;
            console.log('Billing worker started');

            // Start processing loop
            this.processLoop();
        } catch (error) {
            console.error('Error starting billing worker:', error);
            throw error;
        }
    }

    /**
     * Stop the billing worker
     */
    stop() {
        this.isRunning = false;
        console.log('Billing worker stopped');
    }

    /**
     * Main processing loop
     */
    async processLoop() {
        while (this.isRunning) {
            try {
                await this.processUsageLogs();
                await this.createHourlySnapshots();
                await this.createDailySnapshots();

                // Wait before next iteration
                await new Promise(resolve => setTimeout(resolve, this.processingInterval));
            } catch (error) {
                console.error('Error in billing worker loop:', error);
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, this.processingInterval));
            }
        }
    }

    /**
     * Process usage logs from Redis stream
     */
    async processUsageLogs() {
        try {
            const messages = await redisService.readFromConsumerGroup(
                this.groupName,
                this.consumerName,
                this.batchSize
            );

            if (!messages || messages.length === 0) {
                return;
            }

            for (const messageGroup of messages) {
                const [streamKey, messages] = messageGroup;

                for (const [messageId, fields] of messages) {
                    try {
                        // Process the message
                        await this.processMessage(fields);

                        // Acknowledge the message
                        await redisService.acknowledgeMessage(streamKey, this.groupName, messageId);

                        console.log(`Processed message ${messageId}`);
                    } catch (error) {
                        console.error(`Error processing message ${messageId}:`, error);
                        // Don't acknowledge failed messages - they'll be retried
                    }
                }
            }
        } catch (error) {
            console.error('Error processing usage logs:', error);
        }
    }

    /**
     * Process individual message
     */
    async processMessage(fields) {
        // Convert fields array to object
        const message = {};
        for (let i = 0; i < fields.length; i += 2) {
            message[fields[i]] = fields[i + 1];
        }

        // Parse metadata
        if (message.metadata) {
            try {
                message.metadata = JSON.parse(message.metadata);
            } catch (error) {
                message.metadata = {};
            }
        }

        // Update real-time metrics (could be stored in Redis for dashboard)
        await this.updateRealTimeMetrics(message);
    }

    /**
     * Update real-time metrics
     */
    async updateRealTimeMetrics(message) {
        const key = `metrics:${message.userId}:${message.apiId}`;
        const pipeline = redisService.redis.pipeline();

        pipeline.hincrby(key, 'requests', 1);
        pipeline.hincrby(key, 'bytes_in', parseInt(message.bytesIn));
        pipeline.hincrby(key, 'bytes_out', parseInt(message.bytesOut));
        pipeline.hincrby(key, 'cost', Math.round(parseFloat(message.cost) * 1000000));
        pipeline.hincrby(key, 'duration', parseInt(message.duration));

        if (parseInt(message.statusCode) >= 400) {
            pipeline.hincrby(key, 'errors', 1);
        } else {
            pipeline.hincrby(key, 'success', 1);
        }

        // Set expiry to 1 hour
        pipeline.expire(key, 3600);

        await pipeline.exec();
    }

    /**
     * Create hourly usage snapshots
     */
    async createHourlySnapshots() {
        const now = new Date();
        const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

        // Only create snapshots at the start of each hour
        if (now.getMinutes() !== 0) {
            return;
        }

        try {
            const hourlyData = await UsageLog.aggregate([
                {
                    $match: {
                        timestamp: {
                            $gte: hourStart,
                            $lt: new Date(hourStart.getTime() + 60 * 60 * 1000)
                        }
                    }
                },
                {
                    $group: {
                        _id: {
                            userId: '$userId',
                            apiId: '$apiId'
                        },
                        requestCount: { $sum: 1 },
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
                        },
                        statusCodes: {
                            $push: '$statusCode'
                        },
                        endpoints: {
                            $push: '$endpoint'
                        }
                    }
                }
            ]);

            for (const data of hourlyData) {
                const statusCodeMap = new Map();
                const endpointMap = new Map();

                // Count status codes
                data.statusCodes.forEach(code => {
                    statusCodeMap.set(code, (statusCodeMap.get(code) || 0) + 1);
                });

                // Count endpoints
                data.endpoints.forEach(endpoint => {
                    endpointMap.set(endpoint, (endpointMap.get(endpoint) || 0) + 1);
                });

                const snapshot = new UsageSnapshot({
                    userId: data._id.userId,
                    apiId: data._id.apiId,
                    period: 'hourly',
                    periodStart: hourStart,
                    periodEnd: new Date(hourStart.getTime() + 60 * 60 * 1000),
                    requestCount: data.requestCount,
                    totalDuration: data.totalDuration,
                    totalBytesIn: data.totalBytesIn,
                    totalBytesOut: data.totalBytesOut,
                    totalCost: data.totalCost,
                    averageDuration: data.averageDuration,
                    errorCount: data.errorCount,
                    successCount: data.successCount,
                    statusCodes: statusCodeMap,
                    endpoints: endpointMap
                });

                await snapshot.save();
            }

            console.log(`Created ${hourlyData.length} hourly snapshots`);
        } catch (error) {
            console.error('Error creating hourly snapshots:', error);
        }
    }

    /**
     * Create daily usage snapshots
     */
    async createDailySnapshots() {
        const now = new Date();
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

        // Only create snapshots at midnight
        if (now.getHours() !== 0 || now.getMinutes() !== 0) {
            return;
        }

        try {
            const dailyData = await UsageLog.aggregate([
                {
                    $match: {
                        timestamp: {
                            $gte: dayStart,
                            $lt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
                        }
                    }
                },
                {
                    $group: {
                        _id: {
                            userId: '$userId',
                            apiId: '$apiId'
                        },
                        requestCount: { $sum: 1 },
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
                        },
                        statusCodes: {
                            $push: '$statusCode'
                        },
                        endpoints: {
                            $push: '$endpoint'
                        }
                    }
                }
            ]);

            for (const data of dailyData) {
                const statusCodeMap = new Map();
                const endpointMap = new Map();

                // Count status codes
                data.statusCodes.forEach(code => {
                    statusCodeMap.set(code, (statusCodeMap.get(code) || 0) + 1);
                });

                // Count endpoints
                data.endpoints.forEach(endpoint => {
                    endpointMap.set(endpoint, (endpointMap.get(endpoint) || 0) + 1);
                });

                const snapshot = new UsageSnapshot({
                    userId: data._id.userId,
                    apiId: data._id.apiId,
                    period: 'daily',
                    periodStart: dayStart,
                    periodEnd: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000),
                    requestCount: data.requestCount,
                    totalDuration: data.totalDuration,
                    totalBytesIn: data.totalBytesIn,
                    totalBytesOut: data.totalBytesOut,
                    totalCost: data.totalCost,
                    averageDuration: data.averageDuration,
                    errorCount: data.errorCount,
                    successCount: data.successCount,
                    statusCodes: statusCodeMap,
                    endpoints: endpointMap
                });

                await snapshot.save();
            }

            console.log(`Created ${dailyData.length} daily snapshots`);
        } catch (error) {
            console.error('Error creating daily snapshots:', error);
        }
    }

    /**
     * Get worker status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            groupName: this.groupName,
            consumerName: this.consumerName,
            batchSize: this.batchSize,
            processingInterval: this.processingInterval
        };
    }
}

module.exports = new BillingWorker(); 
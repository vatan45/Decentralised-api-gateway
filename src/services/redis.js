const Redis = require('ioredis');

class RedisService {
    constructor() {
        this.redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD,
            db: process.env.REDIS_DB || 0,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true
        });

        this.redis.on('error', (error) => {
            console.error('Redis connection error:', error);
        });

        this.redis.on('connect', () => {
            console.log('Connected to Redis');
        });

        this.redis.on('ready', () => {
            console.log('Redis is ready');
        });
    }

    /**
     * Add usage log to Redis stream
     */
    async addUsageLog(usageData) {
        try {
            const streamKey = 'usage_logs';
            const entry = {
                apiId: usageData.apiId,
                userId: usageData.userId,
                endpoint: usageData.endpoint,
                method: usageData.method,
                timestamp: usageData.timestamp,
                duration: usageData.duration,
                bytesIn: usageData.bytesIn,
                bytesOut: usageData.bytesOut,
                statusCode: usageData.statusCode,
                ipAddress: usageData.ipAddress,
                userAgent: usageData.userAgent,
                apiKey: usageData.apiKey,
                executionId: usageData.executionId,
                cost: usageData.cost,
                metadata: JSON.stringify(usageData.metadata || {})
            };

            const result = await this.redis.xadd(streamKey, '*', ...Object.entries(entry).flat());
            return result;
        } catch (error) {
            console.error('Error adding usage log to Redis stream:', error);
            throw error;
        }
    }

    /**
     * Read usage logs from stream
     */
    async readUsageLogs(count = 100, lastId = '0') {
        try {
            const streamKey = 'usage_logs';
            const result = await this.redis.xread('COUNT', count, 'STREAMS', streamKey, lastId);
            return result;
        } catch (error) {
            console.error('Error reading usage logs from Redis stream:', error);
            throw error;
        }
    }

    /**
     * Create consumer group for usage logs
     */
    async createConsumerGroup(groupName, consumerName) {
        try {
            const streamKey = 'usage_logs';
            await this.redis.xgroup('CREATE', streamKey, groupName, '$', 'MKSTREAM');
            console.log(`Created consumer group: ${groupName}`);
        } catch (error) {
            if (error.message.includes('BUSYGROUP')) {
                console.log(`Consumer group ${groupName} already exists`);
            } else {
                console.error('Error creating consumer group:', error);
                throw error;
            }
        }
    }

    /**
     * Read from consumer group
     */
    async readFromConsumerGroup(groupName, consumerName, count = 10) {
        try {
            const streamKey = 'usage_logs';
            const result = await this.redis.xreadgroup(
                'GROUP', groupName, consumerName,
                'COUNT', count,
                'STREAMS', streamKey, '>'
            );
            return result;
        } catch (error) {
            console.error('Error reading from consumer group:', error);
            throw error;
        }
    }

    /**
     * Acknowledge processed messages
     */
    async acknowledgeMessage(streamKey, groupName, messageId) {
        try {
            await this.redis.xack(streamKey, groupName, messageId);
        } catch (error) {
            console.error('Error acknowledging message:', error);
            throw error;
        }
    }

    /**
     * Get stream length
     */
    async getStreamLength(streamKey = 'usage_logs') {
        try {
            return await this.redis.xlen(streamKey);
        } catch (error) {
            console.error('Error getting stream length:', error);
            throw error;
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            await this.redis.ping();
            return { status: 'healthy', redis: 'connected' };
        } catch (error) {
            return { status: 'unhealthy', redis: 'disconnected', error: error.message };
        }
    }
}

module.exports = new RedisService();
const usageMeteringService = require('../services/usageMetering');
const billingWorker = require('../services/billingWorker');
const redisService = require('../services/redis');
const UsageLog = require('../models/UsageLog');
const UsageSnapshot = require('../models/UsageSnapshot');

// Mock Redis service
jest.mock('../services/redis');

describe('Usage Metering System', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('UsageMeteringService', () => {
        it('should log API usage and push to Redis stream', async () => {
            // Mock Redis addUsageLog
            redisService.addUsageLog.mockResolvedValue('test-stream-id');

            const usageData = {
                apiId: '64f1a2b3c4d5e6f7g8h9i0j1',
                userId: '64f1a2b3c4d5e6f7g8h9i0j2',
                endpoint: '/api/test',
                method: 'POST',
                duration: 150,
                statusCode: 200,
                request: {
                    url: '/api/test',
                    method: 'POST',
                    body: { test: 'data' }
                },
                response: {
                    body: { result: 'success' }
                },
                ipAddress: '127.0.0.1',
                userAgent: 'test-agent',
                apiKey: 'test-api-key',
                executionId: 'test-execution-id'
            };

            const result = await usageMeteringService.logUsage(usageData);

            expect(result).toBeDefined();
            expect(result.apiId).toBe(usageData.apiId);
            expect(result.userId).toBe(usageData.userId);
            expect(result.cost).toBeGreaterThan(0);
            expect(redisService.addUsageLog).toHaveBeenCalled();
        });

        it('should calculate request and response sizes correctly', () => {
            const request = {
                url: '/api/test',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: { test: 'data' },
                query: { param: 'value' }
            };

            const response = {
                headers: { 'Content-Type': 'application/json' },
                body: { result: 'success' }
            };

            const bytesIn = usageMeteringService.calculateRequestSize(request);
            const bytesOut = usageMeteringService.calculateResponseSize(response);

            expect(bytesIn).toBeGreaterThan(0);
            expect(bytesOut).toBeGreaterThan(0);
        });

        it('should calculate cost based on pricing and usage', () => {
            const pricing = {
                basePrice: 0.001,
                durationPrice: 0.0001,
                dataPrice: 0.000001
            };

            const duration = 150; // ms
            const bytesIn = 1024;
            const bytesOut = 512;

            const cost = usageMeteringService.calculateCost(pricing, duration, bytesIn, bytesOut);

            expect(cost).toBeGreaterThan(0);
            expect(typeof cost).toBe('number');
        });

        it('should get user usage statistics', async () => {
            // Mock UsageLog.aggregate
            UsageLog.aggregate = jest.fn().mockResolvedValue([
                {
                    apiId: '64f1a2b3c4d5e6f7g8h9i0j1',
                    apiName: 'Test API',
                    totalRequests: 100,
                    totalDuration: 15000,
                    totalBytesIn: 1024000,
                    totalBytesOut: 512000,
                    totalCost: 0.15,
                    averageDuration: 150,
                    errorCount: 5,
                    successCount: 95
                }
            ]);

            const usage = await usageMeteringService.getUserUsage('64f1a2b3c4d5e6f7g8h9i0j2', '24h');

            expect(usage).toBeDefined();
            expect(usage.length).toBe(1);
            expect(usage[0].totalRequests).toBe(100);
            expect(usage[0].totalCost).toBe(0.15);
        });

        it('should get API usage statistics', async () => {
            // Mock UsageLog.aggregate
            UsageLog.aggregate = jest.fn().mockResolvedValue([
                {
                    userId: '64f1a2b3c4d5e6f7g8h9i0j2',
                    userName: 'Test User',
                    userEmail: 'test@example.com',
                    totalRequests: 50,
                    totalDuration: 7500,
                    totalBytesIn: 512000,
                    totalBytesOut: 256000,
                    totalCost: 0.075,
                    averageDuration: 150,
                    errorCount: 2,
                    successCount: 48
                }
            ]);

            const usage = await usageMeteringService.getApiUsage('64f1a2b3c4d5e6f7g8h9i0j1', '24h');

            expect(usage).toBeDefined();
            expect(usage.length).toBe(1);
            expect(usage[0].totalRequests).toBe(50);
            expect(usage[0].totalCost).toBe(0.075);
        });

        it('should handle different time periods correctly', () => {
            const periods = ['1h', '24h', '7d', '30d'];

            periods.forEach(period => {
                const startDate = usageMeteringService.getStartDate(period);
                expect(startDate).toBeInstanceOf(Date);
                expect(startDate.getTime()).toBeLessThan(Date.now());
            });
        });

        it('should return health check status', async () => {
            // Mock Redis health check
            redisService.healthCheck.mockResolvedValue({
                status: 'healthy',
                redis: 'connected'
            });

            const health = await usageMeteringService.healthCheck();

            expect(health).toBeDefined();
            expect(health.status).toBe('healthy');
            expect(health.redis).toBeDefined();
        });

        it('should handle errors gracefully', async () => {
            // Mock Redis addUsageLog to throw error
            redisService.addUsageLog.mockRejectedValue(new Error('Redis error'));

            const usageData = {
                apiId: '64f1a2b3c4d5e6f7g8h9i0j1',
                userId: '64f1a2b3c4d5e6f7g8h9i0j2',
                endpoint: '/api/test',
                method: 'POST',
                duration: 150,
                statusCode: 200,
                request: {},
                response: {}
            };

            await expect(usageMeteringService.logUsage(usageData)).rejects.toThrow('Redis error');
        });
    });

    describe('BillingWorker', () => {
        it('should start and stop correctly', async () => {
            // Mock Redis methods
            redisService.createConsumerGroup.mockResolvedValue();
            redisService.readFromConsumerGroup.mockResolvedValue([]);

            await billingWorker.start();
            expect(billingWorker.isRunning).toBe(true);

            billingWorker.stop();
            expect(billingWorker.isRunning).toBe(false);
        });

        it('should process usage logs from Redis stream', async () => {
            // Mock Redis methods
            redisService.createConsumerGroup.mockResolvedValue();
            redisService.readFromConsumerGroup.mockResolvedValue([
                ['usage_logs', [
                    ['test-message-id', [
                        'apiId', '64f1a2b3c4d5e6f7g8h9i0j1',
                        'userId', '64f1a2b3c4d5e6f7g8h9i0j2',
                        'duration', '150',
                        'cost', '0.001',
                        'metadata', '{}'
                    ]]
                ]]
            ]);
            redisService.acknowledgeMessage.mockResolvedValue();

            await billingWorker.start();

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(redisService.readFromConsumerGroup).toHaveBeenCalled();
            expect(redisService.acknowledgeMessage).toHaveBeenCalled();

            billingWorker.stop();
        });

        it('should create hourly snapshots', async () => {
            // Mock UsageLog.aggregate
            UsageLog.aggregate = jest.fn().mockResolvedValue([
                {
                    _id: {
                        userId: '64f1a2b3c4d5e6f7g8h9i0j2',
                        apiId: '64f1a2b3c4d5e6f7g8h9i0j1'
                    },
                    requestCount: 10,
                    totalDuration: 1500,
                    totalBytesIn: 102400,
                    totalBytesOut: 51200,
                    totalCost: 0.015,
                    averageDuration: 150,
                    errorCount: 1,
                    successCount: 9,
                    statusCodes: [200, 200, 404, 200],
                    endpoints: ['/api/test', '/api/test', '/api/test', '/api/test']
                }
            ]);

            // Mock UsageSnapshot constructor and save
            const mockSave = jest.fn().mockResolvedValue();
            UsageSnapshot.mockImplementation(() => ({
                save: mockSave
            }));

            await billingWorker.createHourlySnapshots();

            expect(UsageLog.aggregate).toHaveBeenCalled();
            expect(mockSave).toHaveBeenCalled();
        });

        it('should create daily snapshots', async () => {
            // Mock UsageLog.aggregate
            UsageLog.aggregate = jest.fn().mockResolvedValue([
                {
                    _id: {
                        userId: '64f1a2b3c4d5e6f7g8h9i0j2',
                        apiId: '64f1a2b3c4d5e6f7g8h9i0j1'
                    },
                    requestCount: 100,
                    totalDuration: 15000,
                    totalBytesIn: 1024000,
                    totalBytesOut: 512000,
                    totalCost: 0.15,
                    averageDuration: 150,
                    errorCount: 5,
                    successCount: 95,
                    statusCodes: Array(100).fill(200),
                    endpoints: Array(100).fill('/api/test')
                }
            ]);

            // Mock UsageSnapshot constructor and save
            const mockSave = jest.fn().mockResolvedValue();
            UsageSnapshot.mockImplementation(() => ({
                save: mockSave
            }));

            await billingWorker.createDailySnapshots();

            expect(UsageLog.aggregate).toHaveBeenCalled();
            expect(mockSave).toHaveBeenCalled();
        });

        it('should update real-time metrics in Redis', async () => {
            // Mock Redis pipeline
            const mockPipeline = {
                hincrby: jest.fn().mockReturnThis(),
                expire: jest.fn().mockReturnThis(),
                exec: jest.fn().mockResolvedValue()
            };
            redisService.redis.pipeline.mockReturnValue(mockPipeline);

            const message = {
                userId: '64f1a2b3c4d5e6f7g8h9i0j2',
                apiId: '64f1a2b3c4d5e6f7g8h9i0j1',
                bytesIn: '1024',
                bytesOut: '512',
                cost: '0.001',
                duration: '150',
                statusCode: '200'
            };

            await billingWorker.updateRealTimeMetrics(message);

            expect(redisService.redis.pipeline).toHaveBeenCalled();
            expect(mockPipeline.hincrby).toHaveBeenCalledTimes(6);
            expect(mockPipeline.exec).toHaveBeenCalled();
        });

        it('should return worker status', () => {
            const status = billingWorker.getStatus();

            expect(status).toBeDefined();
            expect(status).toHaveProperty('isRunning');
            expect(status).toHaveProperty('groupName');
            expect(status).toHaveProperty('consumerName');
            expect(status).toHaveProperty('batchSize');
            expect(status).toHaveProperty('processingInterval');
        });

        it('should handle processing errors gracefully', async () => {
            // Mock Redis methods to throw errors
            redisService.createConsumerGroup.mockRejectedValue(new Error('Redis error'));
            redisService.readFromConsumerGroup.mockRejectedValue(new Error('Read error'));

            // Should not throw error
            await expect(billingWorker.start()).rejects.toThrow('Redis error');
        });
    });

    describe('RedisService', () => {
        it('should add usage log to stream', async () => {
            const usageData = {
                apiId: '64f1a2b3c4d5e6f7g8h9i0j1',
                userId: '64f1a2b3c4d5e6f7g8h9i0j2',
                duration: 150,
                cost: 0.001
            };

            // Mock Redis xadd
            redisService.redis.xadd = jest.fn().mockResolvedValue('test-stream-id');

            const result = await redisService.addUsageLog(usageData);

            expect(result).toBe('test-stream-id');
            expect(redisService.redis.xadd).toHaveBeenCalled();
        });

        it('should read usage logs from stream', async () => {
            // Mock Redis xread
            redisService.redis.xread = jest.fn().mockResolvedValue([
                ['usage_logs', [
                    ['test-id', ['apiId', 'test-api', 'duration', '150']]
                ]]
            ]);

            const result = await redisService.readUsageLogs(10, '0');

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(redisService.redis.xread).toHaveBeenCalled();
        });

        it('should create consumer group', async () => {
            // Mock Redis xgroup
            redisService.redis.xgroup = jest.fn().mockResolvedValue();

            await redisService.createConsumerGroup('test-group', 'test-consumer');

            expect(redisService.redis.xgroup).toHaveBeenCalledWith(
                'CREATE', 'usage_logs', 'test-group', '$', 'MKSTREAM'
            );
        });

        it('should read from consumer group', async () => {
            // Mock Redis xreadgroup
            redisService.redis.xreadgroup = jest.fn().mockResolvedValue([
                ['usage_logs', [
                    ['test-id', ['apiId', 'test-api', 'duration', '150']]
                ]]
            ]);

            const result = await redisService.readFromConsumerGroup('test-group', 'test-consumer', 10);

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(redisService.redis.xreadgroup).toHaveBeenCalled();
        });

        it('should acknowledge messages', async () => {
            // Mock Redis xack
            redisService.redis.xack = jest.fn().mockResolvedValue(1);

            await redisService.acknowledgeMessage('usage_logs', 'test-group', 'test-id');

            expect(redisService.redis.xack).toHaveBeenCalledWith('usage_logs', 'test-group', 'test-id');
        });

        it('should get stream length', async () => {
            // Mock Redis xlen
            redisService.redis.xlen = jest.fn().mockResolvedValue(100);

            const length = await redisService.getStreamLength('usage_logs');

            expect(length).toBe(100);
            expect(redisService.redis.xlen).toHaveBeenCalledWith('usage_logs');
        });

        it('should perform health check', async () => {
            // Mock Redis ping
            redisService.redis.ping = jest.fn().mockResolvedValue('PONG');

            const health = await redisService.healthCheck();

            expect(health.status).toBe('healthy');
            expect(health.redis).toBe('connected');
        });

        it('should handle health check errors', async () => {
            // Mock Redis ping to throw error
            redisService.redis.ping = jest.fn().mockRejectedValue(new Error('Connection failed'));

            const health = await redisService.healthCheck();

            expect(health.status).toBe('unhealthy');
            expect(health.redis).toBe('disconnected');
            expect(health.error).toBe('Connection failed');
        });
    });

    describe('Usage Models', () => {
        it('should create UsageLog with required fields', () => {
            const usageLog = new UsageLog({
                apiId: '64f1a2b3c4d5e6f7g8h9i0j1',
                userId: '64f1a2b3c4d5e6f7g8h9i0j2',
                endpoint: '/api/test',
                method: 'POST',
                duration: 150,
                bytesIn: 1024,
                bytesOut: 512,
                statusCode: 200,
                cost: 0.001
            });

            expect(usageLog.apiId).toBe('64f1a2b3c4d5e6f7g8h9i0j1');
            expect(usageLog.userId).toBe('64f1a2b3c4d5e6f7g8h9i0j2');
            expect(usageLog.endpoint).toBe('/api/test');
            expect(usageLog.method).toBe('POST');
            expect(usageLog.duration).toBe(150);
            expect(usageLog.cost).toBe(0.001);
        });

        it('should create UsageSnapshot with required fields', () => {
            const snapshot = new UsageSnapshot({
                userId: '64f1a2b3c4d5e6f7g8h9i0j2',
                apiId: '64f1a2b3c4d5e6f7g8h9i0j1',
                period: 'hourly',
                periodStart: new Date(),
                periodEnd: new Date(),
                requestCount: 100,
                totalDuration: 15000,
                totalBytesIn: 1024000,
                totalBytesOut: 512000,
                totalCost: 0.15,
                averageDuration: 150,
                errorCount: 5,
                successCount: 95
            });

            expect(snapshot.userId).toBe('64f1a2b3c4d5e6f7g8h9i0j2');
            expect(snapshot.apiId).toBe('64f1a2b3c4d5e6f7g8h9i0j1');
            expect(snapshot.period).toBe('hourly');
            expect(snapshot.requestCount).toBe(100);
            expect(snapshot.totalCost).toBe(0.15);
        });

        it('should validate UsageLog required fields', () => {
            const usageLog = new UsageLog({});

            const validationError = usageLog.validateSync();
            expect(validationError).toBeDefined();
            expect(validationError.errors.apiId).toBeDefined();
            expect(validationError.errors.userId).toBeDefined();
            expect(validationError.errors.endpoint).toBeDefined();
            expect(validationError.errors.method).toBeDefined();
        });

        it('should validate UsageSnapshot required fields', () => {
            const snapshot = new UsageSnapshot({});

            const validationError = snapshot.validateSync();
            expect(validationError).toBeDefined();
            expect(validationError.errors.userId).toBeDefined();
            expect(validationError.errors.apiId).toBeDefined();
            expect(validationError.errors.period).toBeDefined();
            expect(validationError.errors.periodStart).toBeDefined();
        });
    });

    describe('Integration Tests', () => {
        it('should log usage and process through worker', async () => {
            // Mock all dependencies
            redisService.addUsageLog.mockResolvedValue('test-stream-id');
            redisService.createConsumerGroup.mockResolvedValue();
            redisService.readFromConsumerGroup.mockResolvedValue([
                ['usage_logs', [
                    ['test-id', [
                        'apiId', '64f1a2b3c4d5e6f7g8h9i0j1',
                        'userId', '64f1a2b3c4d5e6f7g8h9i0j2',
                        'duration', '150',
                        'cost', '0.001'
                    ]]
                ]]
            ]);
            redisService.acknowledgeMessage.mockResolvedValue();

            // Log usage
            const usageData = {
                apiId: '64f1a2b3c4d5e6f7g8h9i0j1',
                userId: '64f1a2b3c4d5e6f7g8h9i0j2',
                endpoint: '/api/test',
                method: 'POST',
                duration: 150,
                statusCode: 200,
                request: {},
                response: {}
            };

            const logResult = await usageMeteringService.logUsage(usageData);
            expect(logResult).toBeDefined();

            // Start worker and process
            await billingWorker.start();
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(redisService.addUsageLog).toHaveBeenCalled();
            expect(redisService.readFromConsumerGroup).toHaveBeenCalled();

            billingWorker.stop();
        });

        it('should handle high volume usage logging', async () => {
            // Mock Redis to handle multiple calls
            redisService.addUsageLog.mockResolvedValue('test-stream-id');

            const promises = [];
            for (let i = 0; i < 100; i++) {
                const usageData = {
                    apiId: '64f1a2b3c4d5e6f7g8h9i0j1',
                    userId: '64f1a2b3c4d5e6f7g8h9i0j2',
                    endpoint: '/api/test',
                    method: 'POST',
                    duration: 150,
                    statusCode: 200,
                    request: {},
                    response: {}
                };
                promises.push(usageMeteringService.logUsage(usageData));
            }

            const results = await Promise.all(promises);
            expect(results).toHaveLength(100);
            expect(redisService.addUsageLog).toHaveBeenCalledTimes(100);
        });
    });
});
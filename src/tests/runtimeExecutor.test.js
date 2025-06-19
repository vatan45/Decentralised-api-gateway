const runtimeExecutor = require('../services/runtimeExecutor');
const ipfsService = require('../services/ipfs');

// Mock IPFS service for testing
jest.mock('../services/ipfs');

describe('Runtime Executor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('executeApi', () => {
        it('should execute uploaded API code successfully', async () => {
            // Mock IPFS service to return a simple API
            const mockApiCode = `
const express = require('express');
const app = express();

app.use(express.json());

app.post('/test', (req, res) => {
    res.json({
        message: 'Hello from API!',
        data: req.body,
        timestamp: new Date().toISOString()
    });
});

app.listen(3000, () => {
    console.log('API server running on port 3000');
});
            `;

            ipfsService.getFile.mockResolvedValue(mockApiCode);

            const requestData = {
                method: 'POST',
                body: { test: 'data' },
                headers: { 'Content-Type': 'application/json' }
            };

            const result = await runtimeExecutor.executeApi('test-ipfs-hash', requestData);

            expect(result.success).toBe(true);
            expect(result.executionId).toBeDefined();
            expect(result.response).toBeDefined();
            expect(result.logs).toBeDefined();
        });

        it('should handle API crashes and errors gracefully', async () => {
            // Mock IPFS service to return code that will crash
            const crashingCode = `
throw new Error('Intentional crash for testing');
            `;

            ipfsService.getFile.mockResolvedValue(crashingCode);

            const result = await runtimeExecutor.executeApi('crash-test-hash', {});

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.executionId).toBeDefined();
        });

        it('should return valid JSON response', async () => {
            // Mock IPFS service to return code that returns JSON
            const jsonApiCode = `
console.log(JSON.stringify({
    status: 'success',
    message: 'API executed successfully',
    data: { test: true }
}));
            `;

            ipfsService.getFile.mockResolvedValue(jsonApiCode);

            const result = await runtimeExecutor.executeApi('json-test-hash', {});

            expect(result.success).toBe(true);
            expect(result.response).toHaveProperty('status');
            expect(result.response).toHaveProperty('message');
        });

        it('should handle execution timeout', async () => {
            // Mock IPFS service to return code that runs indefinitely
            const infiniteCode = `
while(true) {
    // Infinite loop
}
            `;

            ipfsService.getFile.mockResolvedValue(infiniteCode);

            const result = await runtimeExecutor.executeApi('timeout-test-hash', {});

            expect(result.success).toBe(false);
            expect(result.error).toContain('timeout');
        });

        it('should handle memory limits', async () => {
            // Mock IPFS service to return code that uses excessive memory
            const memoryIntensiveCode = `
const arr = [];
while(true) {
    arr.push(new Array(1000000).fill('x'));
}
            `;

            ipfsService.getFile.mockResolvedValue(memoryIntensiveCode);

            const result = await runtimeExecutor.executeApi('memory-test-hash', {});

            expect(result.success).toBe(false);
        });
    });

    describe('healthCheck', () => {
        it('should return healthy status when Docker is available', async () => {
            const health = await runtimeExecutor.healthCheck();
            expect(health).toHaveProperty('status');
        });
    });

    describe('getStats', () => {
        it('should return runtime statistics', async () => {
            const stats = await runtimeExecutor.getStats();
            expect(stats).toHaveProperty('totalContainers');
            expect(stats).toHaveProperty('runningContainers');
            expect(stats).toHaveProperty('maxMemory');
            expect(stats).toHaveProperty('maxCpu');
        });
    });
}); 
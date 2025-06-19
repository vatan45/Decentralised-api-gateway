const Docker = require('dockerode');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const ipfsService = require('./ipfs');

class RuntimeExecutor {
    constructor() {
        this.docker = new Docker({
            socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock'
        });
        this.executionTimeout = parseInt(process.env.EXECUTION_TIMEOUT) || 30000; // 30 seconds
        this.maxMemory = process.env.MAX_MEMORY || '512m';
        this.maxCpu = process.env.MAX_CPU || '0.5';
        this.baseImage = process.env.BASE_IMAGE || 'node:18-alpine';
    }

    /**
     * Execute API code securely in a Docker container
     * @param {string} ipfsHash - IPFS hash of the API code
     * @param {Object} requestData - Request data (method, headers, body, etc.)
     * @returns {Object} - Execution result with response, logs, and metadata
     */
    async executeApi(ipfsHash, requestData = {}) {
        const executionId = uuidv4();
        const tempDir = path.join(os.tmpdir(), `api-exec-${executionId}`);

        try {
            console.log(`[${executionId}] Starting API execution for IPFS hash: ${ipfsHash}`);

            // Fetch code from IPFS
            const apiCode = await this.fetchCodeFromIPFS(ipfsHash);

            // Create temporary directory and write code
            await this.prepareExecutionEnvironment(tempDir, apiCode, requestData);

            // Execute in Docker container
            const result = await this.runInContainer(executionId, tempDir, requestData);

            console.log(`[${executionId}] API execution completed successfully`);
            return {
                success: true,
                executionId,
                response: result.response,
                logs: result.logs,
                executionTime: result.executionTime,
                memoryUsage: result.memoryUsage
            };

        } catch (error) {
            console.error(`[${executionId}] API execution failed:`, error);
            return {
                success: false,
                executionId,
                error: error.message,
                logs: error.logs || [],
                executionTime: Date.now() - (error.startTime || Date.now())
            };
        } finally {
            // Cleanup
            await this.cleanup(tempDir);
        }
    }

    /**
     * Fetch API code from IPFS
     */
    async fetchCodeFromIPFS(ipfsHash) {
        try {
            const code = await ipfsService.getFile(ipfsHash);
            return code;
        } catch (error) {
            throw new Error(`Failed to fetch code from IPFS: ${error.message}`);
        }
    }

    /**
     * Prepare execution environment with API code and request data
     */
    async prepareExecutionEnvironment(tempDir, apiCode, requestData) {
        await fs.mkdir(tempDir, { recursive: true });

        // Write API code
        await fs.writeFile(path.join(tempDir, 'api.js'), apiCode);

        // Write request data
        await fs.writeFile(
            path.join(tempDir, 'request.json'),
            JSON.stringify(requestData)
        );

        // Write Dockerfile for secure execution
        await this.createDockerfile(tempDir);

        // Write package.json if not present in code
        await this.createPackageJson(tempDir);
    }

    /**
     * Create a secure Dockerfile for API execution
     */
    async createDockerfile(tempDir) {
        const dockerfile = `
FROM ${this.baseImage}

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \\
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy API code
COPY api.js ./
COPY request.json ./

# Create wrapper script
RUN echo '#!/bin/sh' > /app/run.sh && \\
    echo 'timeout ${this.executionTimeout / 1000}s node api.js < request.json' >> /app/run.sh && \\
    chmod +x /app/run.sh

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (if needed)
EXPOSE 3000

# Run the API
CMD ["/app/run.sh"]
        `.trim();

        await fs.writeFile(path.join(tempDir, 'Dockerfile'), dockerfile);
    }

    /**
     * Create package.json for the execution environment
     */
    async createPackageJson(tempDir) {
        const packageJson = {
            name: "api-runtime",
            version: "1.0.0",
            description: "Secure API execution environment",
            main: "api.js",
            dependencies: {
                "express": "^4.18.2"
            },
            scripts: {
                "start": "node api.js"
            }
        };

        await fs.writeFile(
            path.join(tempDir, 'package.json'),
            JSON.stringify(packageJson, null, 2)
        );
    }

    /**
     * Run API code in a secure Docker container
     */
    async runInContainer(executionId, tempDir, requestData) {
        const startTime = Date.now();
        const containerName = `api-exec-${executionId}`;

        try {
            // Build Docker image
            const buildStream = await this.docker.buildImage({
                context: tempDir,
                src: ['Dockerfile', 'api.js', 'request.json', 'package.json']
            }, { t: containerName });

            await this.waitForBuild(buildStream);

            // Create and start container with resource limits
            const container = await this.docker.createContainer({
                Image: containerName,
                name: containerName,
                HostConfig: {
                    Memory: this.parseMemory(this.maxMemory),
                    CpuPeriod: 100000,
                    CpuQuota: Math.floor(parseFloat(this.maxCpu) * 100000),
                    NetworkMode: 'none', // Isolated network
                    ReadonlyRootfs: true, // Read-only filesystem
                    SecurityOpt: ['no-new-privileges'],
                    CapDrop: ['ALL'], // Drop all capabilities
                    Ulimits: [
                        { Name: 'nofile', Soft: 1024, Hard: 2048 }
                    ]
                },
                Env: [
                    'NODE_ENV=production',
                    `EXECUTION_ID=${executionId}`
                ]
            });

            await container.start();

            // Wait for container to complete
            const result = await container.wait();

            // Get container logs
            const logs = await this.getContainerLogs(container);

            // Get container stats
            const stats = await this.getContainerStats(container);

            // Parse response from logs
            const response = this.parseResponse(logs);

            await container.remove();

            return {
                response,
                logs,
                executionTime: Date.now() - startTime,
                memoryUsage: stats.memoryUsage,
                exitCode: result.StatusCode
            };

        } catch (error) {
            // Cleanup container if it exists
            try {
                const container = this.docker.getContainer(containerName);
                await container.remove({ force: true });
            } catch (cleanupError) {
                console.warn(`Failed to cleanup container ${containerName}:`, cleanupError);
            }
            throw error;
        }
    }

    /**
     * Wait for Docker build to complete
     */
    async waitForBuild(buildStream) {
        return new Promise((resolve, reject) => {
            buildStream.on('data', (chunk) => {
                const output = chunk.toString();
                if (output.includes('error')) {
                    reject(new Error(`Docker build failed: ${output}`));
                }
            });

            buildStream.on('end', resolve);
            buildStream.on('error', reject);
        });
    }

    /**
     * Get container logs
     */
    async getContainerLogs(container) {
        const logs = await container.logs({
            stdout: true,
            stderr: true,
            tail: 1000
        });

        return logs.toString('utf8');
    }

    /**
     * Get container resource usage statistics
     */
    async getContainerStats(container) {
        const stats = await container.stats({ stream: false });

        return {
            memoryUsage: stats.memory_stats.usage || 0,
            cpuUsage: stats.cpu_stats.cpu_usage.total_usage || 0
        };
    }

    /**
     * Parse response from container logs
     */
    parseResponse(logs) {
        try {
            // Look for JSON response in logs
            const lines = logs.split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                if (line.startsWith('{') && line.endsWith('}')) {
                    return JSON.parse(line);
                }
            }

            // If no JSON found, return logs as response
            return {
                message: 'API executed successfully',
                logs: logs
            };
        } catch (error) {
            return {
                error: 'Failed to parse API response',
                logs: logs
            };
        }
    }

    /**
     * Parse memory string to bytes
     */
    parseMemory(memoryStr) {
        const units = {
            'b': 1,
            'k': 1024,
            'm': 1024 * 1024,
            'g': 1024 * 1024 * 1024
        };

        const match = memoryStr.match(/^(\d+)([bkmg])$/i);
        if (match) {
            const value = parseInt(match[1]);
            const unit = match[2].toLowerCase();
            return value * units[unit];
        }

        return 512 * 1024 * 1024; // Default 512MB
    }

    /**
     * Cleanup temporary files
     */
    async cleanup(tempDir) {
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            console.warn(`Failed to cleanup ${tempDir}:`, error);
        }
    }

    /**
     * Health check for the runtime executor
     */
    async healthCheck() {
        try {
            await this.docker.ping();
            return { status: 'healthy', docker: 'connected' };
        } catch (error) {
            return { status: 'unhealthy', docker: 'disconnected', error: error.message };
        }
    }

    /**
     * Get execution statistics
     */
    async getStats() {
        try {
            const containers = await this.docker.listContainers({ all: true });
            const runningContainers = containers.filter(c => c.State === 'running');

            return {
                totalContainers: containers.length,
                runningContainers: runningContainers.length,
                maxMemory: this.maxMemory,
                maxCpu: this.maxCpu,
                executionTimeout: this.executionTimeout
            };
        } catch (error) {
            throw new Error(`Failed to get runtime stats: ${error.message}`);
        }
    }
}

module.exports = new RuntimeExecutor(); 
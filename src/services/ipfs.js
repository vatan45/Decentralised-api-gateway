const { create } = require('ipfs-http-client');
const { Buffer } = require('buffer');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class IPFSService {
    constructor() {
        this.ipfs = create({
            host: process.env.IPFS_HOST || 'ipfs.infura.io',
            port: process.env.IPFS_PORT || 5001,
            protocol: process.env.IPFS_PROTOCOL || 'https',
            headers: {
                authorization: `Basic ${Buffer.from(
                    `${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_PROJECT_SECRET}`
                ).toString('base64')}`
            },
            timeout: parseInt(process.env.IPFS_TIMEOUT) || 30000
        });

        this.cacheDir = path.join(os.tmpdir(), 'ipfs-cache');
        this.maxCacheSize = parseInt(process.env.IPFS_MAX_CACHE_SIZE) || 100 * 1024 * 1024; // 100MB
        this.cacheExpiry = parseInt(process.env.IPFS_CACHE_EXPIRY) || 24 * 60 * 60 * 1000; // 24 hours
        this.retryAttempts = parseInt(process.env.IPFS_RETRY_ATTEMPTS) || 3;
        this.retryDelay = parseInt(process.env.IPFS_RETRY_DELAY) || 1000;

        this.initCache();
    }

    /**
     * Initialize cache directory
     */
    async initCache() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            console.log('IPFS cache directory initialized');
        } catch (error) {
            console.error('Error initializing IPFS cache:', error);
        }
    }

    /**
     * Upload API code to IPFS with integrity validation
     */
    async uploadApiCode(code, metadata = {}) {
        try {
            console.log('Uploading API code to IPFS...');

            // Validate code
            if (!code || typeof code !== 'string') {
                throw new Error('Invalid code: must be a non-empty string');
            }

            // Calculate content hash for integrity
            const contentHash = this.calculateContentHash(code);

            // Create upload object with metadata
            const uploadObject = {
                code,
                metadata: {
                    ...metadata,
                    contentType: 'application/javascript',
                    uploadTimestamp: new Date().toISOString(),
                    contentHash,
                    version: '1.0.0'
                }
            };

            // Convert to JSON string
            const jsonData = JSON.stringify(uploadObject, null, 2);

            // Upload to IPFS
            const result = await this.uploadWithRetry(jsonData);

            // Pin the content
            await this.pinContent(result.cid);

            console.log(`API code uploaded successfully. CID: ${result.cid}`);

            return {
                cid: result.cid,
                size: result.size,
                contentHash,
                uploadTimestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error uploading API code to IPFS:', error);
            throw new Error(`Failed to upload API code: ${error.message}`);
        }
    }

    /**
     * Retrieve API code from IPFS with caching and integrity validation
     */
    async getApiCode(cid, options = {}) {
        const { useCache = true, validateIntegrity = true, timeout = 30000 } = options;

        try {
            console.log(`Retrieving API code from IPFS. CID: ${cid}`);

            // Check cache first
            if (useCache) {
                const cachedData = await this.getFromCache(cid);
                if (cachedData) {
                    console.log(`Retrieved API code from cache. CID: ${cid}`);
                    return cachedData;
                }
            }

            // Retrieve from IPFS with timeout
            const data = await this.getFromIPFSWithTimeout(cid, timeout);

            // Parse the JSON data
            const parsedData = JSON.parse(data);

            // Validate structure
            if (!parsedData.code || !parsedData.metadata) {
                throw new Error('Invalid data structure: missing code or metadata');
            }

            // Validate integrity if requested
            if (validateIntegrity) {
                const calculatedHash = this.calculateContentHash(parsedData.code);
                const storedHash = parsedData.metadata.contentHash;

                if (calculatedHash !== storedHash) {
                    throw new Error('Content integrity validation failed: hash mismatch');
                }
            }

            // Cache the result
            if (useCache) {
                await this.saveToCache(cid, parsedData);
            }

            console.log(`Retrieved API code successfully. CID: ${cid}`);
            return parsedData;
        } catch (error) {
            console.error(`Error retrieving API code from IPFS. CID: ${cid}:`, error);

            // Try cache as fallback if IPFS failed
            if (useCache && !error.message.includes('cache')) {
                console.log('Attempting cache fallback...');
                const cachedData = await this.getFromCache(cid);
                if (cachedData) {
                    console.log(`Retrieved API code from cache fallback. CID: ${cid}`);
                    return cachedData;
                }
            }

            throw new Error(`Failed to retrieve API code: ${error.message}`);
        }
    }

    /**
     * Upload file to IPFS with retry logic
     */
    async uploadWithRetry(data, attempts = 0) {
        try {
            const added = await this.ipfs.add(data);
            return {
                cid: added.path,
                size: added.size
            };
        } catch (error) {
            if (attempts < this.retryAttempts) {
                console.log(`Upload attempt ${attempts + 1} failed, retrying...`);
                await this.delay(this.retryDelay * Math.pow(2, attempts));
                return this.uploadWithRetry(data, attempts + 1);
            }
            throw error;
        }
    }

    /**
     * Get file from IPFS with timeout
     */
    async getFromIPFSWithTimeout(cid, timeout) {
        return new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('IPFS retrieval timeout'));
            }, timeout);

            try {
                const stream = this.ipfs.cat(cid);
                let data = '';

                for await (const chunk of stream) {
                    data += chunk.toString();
                }

                clearTimeout(timeoutId);
                resolve(data);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    /**
     * Pin content to ensure availability
     */
    async pinContent(cid) {
        try {
            await this.ipfs.pin.add(cid);
            console.log(`Content pinned successfully. CID: ${cid}`);
        } catch (error) {
            console.warn(`Failed to pin content. CID: ${cid}:`, error);
            // Don't throw error as pinning is not critical for functionality
        }
    }

    /**
     * Unpin content
     */
    async unpinContent(cid) {
        try {
            await this.ipfs.pin.rm(cid);
            console.log(`Content unpinned successfully. CID: ${cid}`);
        } catch (error) {
            console.warn(`Failed to unpin content. CID: ${cid}:`, error);
        }
    }

    /**
     * Calculate content hash for integrity validation
     */
    calculateContentHash(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Get file from cache
     */
    async getFromCache(cid) {
        try {
            const cacheFile = path.join(this.cacheDir, `${cid}.json`);
            const stats = await fs.stat(cacheFile);

            // Check if cache is expired
            if (Date.now() - stats.mtime.getTime() > this.cacheExpiry) {
                await fs.unlink(cacheFile);
                return null;
            }

            const data = await fs.readFile(cacheFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }

    /**
     * Save file to cache
     */
    async saveToCache(cid, data) {
        try {
            // Check cache size before saving
            await this.cleanupCache();

            const cacheFile = path.join(this.cacheDir, `${cid}.json`);
            await fs.writeFile(cacheFile, JSON.stringify(data, null, 2));

            console.log(`Saved to cache. CID: ${cid}`);
        } catch (error) {
            console.warn(`Failed to save to cache. CID: ${cid}:`, error);
        }
    }

    /**
     * Cleanup cache to maintain size limits
     */
    async cleanupCache() {
        try {
            const files = await fs.readdir(this.cacheDir);
            const fileStats = await Promise.all(
                files.map(async (file) => {
                    const filePath = path.join(this.cacheDir, file);
                    const stats = await fs.stat(filePath);
                    return { file, filePath, stats };
                })
            );

            // Sort by modification time (oldest first)
            fileStats.sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime());

            // Calculate total size
            let totalSize = fileStats.reduce((sum, file) => sum + file.stats.size, 0);

            // Remove oldest files if cache is too large
            for (const file of fileStats) {
                if (totalSize <= this.maxCacheSize) break;

                await fs.unlink(file.filePath);
                totalSize -= file.stats.size;
                console.log(`Removed from cache: ${file.file}`);
            }
        } catch (error) {
            console.warn('Error cleaning up cache:', error);
        }
    }

    /**
     * Validate CID format
     */
    validateCID(cid) {
        // Basic CID validation (v0 or v1)
        const cidRegex = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$|^bafy[a-z2-7]{55}$/;
        return cidRegex.test(cid);
    }

    /**
     * Get file info from IPFS
     */
    async getFileInfo(cid) {
        try {
            const stats = await this.ipfs.files.stat(`/ipfs/${cid}`);
            return {
                cid,
                size: stats.size,
                type: stats.type,
                blocks: stats.blocks
            };
        } catch (error) {
            console.error(`Error getting file info. CID: ${cid}:`, error);
            throw new Error(`Failed to get file info: ${error.message}`);
        }
    }

    /**
     * Check if content is available on IPFS
     */
    async isContentAvailable(cid) {
        try {
            await this.ipfs.cat(cid, { length: 1 }); // Just check first byte
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get IPFS node information
     */
    async getNodeInfo() {
        try {
            const id = await this.ipfs.id();
            const version = await this.ipfs.version();

            return {
                id: id.id,
                addresses: id.addresses,
                agentVersion: id.agentVersion,
                protocolVersion: id.protocolVersion,
                version: version.version,
                commit: version.commit
            };
        } catch (error) {
            console.error('Error getting node info:', error);
            throw new Error(`Failed to get node info: ${error.message}`);
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const nodeInfo = await this.getNodeInfo();
            const cacheStats = await this.getCacheStats();

            return {
                status: 'healthy',
                node: nodeInfo,
                cache: cacheStats,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get cache statistics
     */
    async getCacheStats() {
        try {
            const files = await fs.readdir(this.cacheDir);
            const fileStats = await Promise.all(
                files.map(async (file) => {
                    const filePath = path.join(this.cacheDir, file);
                    const stats = await fs.stat(filePath);
                    return stats.size;
                })
            );

            const totalSize = fileStats.reduce((sum, size) => sum + size, 0);
            const fileCount = files.length;

            return {
                fileCount,
                totalSize,
                maxSize: this.maxCacheSize,
                utilization: (totalSize / this.maxCacheSize) * 100
            };
        } catch (error) {
            return {
                fileCount: 0,
                totalSize: 0,
                maxSize: this.maxCacheSize,
                utilization: 0,
                error: error.message
            };
        }
    }

    /**
     * Clear cache
     */
    async clearCache() {
        try {
            const files = await fs.readdir(this.cacheDir);
            await Promise.all(
                files.map(file => fs.unlink(path.join(this.cacheDir, file)))
            );
            console.log('Cache cleared successfully');
        } catch (error) {
            console.error('Error clearing cache:', error);
            throw error;
        }
    }

    /**
     * Utility function for delays
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new IPFSService(); 
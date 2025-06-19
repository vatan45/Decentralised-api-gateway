const ipfsService = require('../services/ipfs');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Mock ipfs-http-client
jest.mock('ipfs-http-client', () => ({
    create: jest.fn(() => ({
        add: jest.fn(),
        cat: jest.fn(),
        pin: {
            add: jest.fn(),
            rm: jest.fn()
        },
        files: {
            stat: jest.fn()
        },
        id: jest.fn(),
        version: jest.fn()
    }))
}));

describe('IPFS Integration', () => {
    let mockIPFS;

    beforeEach(() => {
        jest.clearAllMocks();
        mockIPFS = require('ipfs-http-client').create();
    });

    describe('uploadApiCode', () => {
        it('should upload code and retrieve it successfully', async () => {
            const testCode = `
const express = require('express');
const app = express();

app.get('/test', (req, res) => {
    res.json({ message: 'Hello from IPFS!' });
});

module.exports = app;
            `;

            const metadata = {
                fileName: 'test-api.js',
                description: 'Test API for IPFS integration'
            };

            // Mock successful upload
            mockIPFS.add.mockResolvedValue({
                path: 'QmTestHash123456789',
                size: 1024
            });

            mockIPFS.pin.add.mockResolvedValue();

            const result = await ipfsService.uploadApiCode(testCode, metadata);

            expect(result).toBeDefined();
            expect(result.cid).toBe('QmTestHash123456789');
            expect(result.size).toBe(1024);
            expect(result.contentHash).toBeDefined();
            expect(result.uploadTimestamp).toBeDefined();
            expect(mockIPFS.add).toHaveBeenCalled();
            expect(mockIPFS.pin.add).toHaveBeenCalledWith('QmTestHash123456789');
        });

        it('should validate code integrity', async () => {
            const testCode = 'console.log("Hello World");';
            const metadata = { fileName: 'test.js' };

            mockIPFS.add.mockResolvedValue({
                path: 'QmTestHash123456789',
                size: 512
            });

            mockIPFS.pin.add.mockResolvedValue();

            const uploadResult = await ipfsService.uploadApiCode(testCode, metadata);
            const contentHash = uploadResult.contentHash;

            // Verify content hash is calculated correctly
            const expectedHash = require('crypto')
                .createHash('sha256')
                .update(testCode)
                .digest('hex');

            expect(contentHash).toBe(expectedHash);
        });

        it('should handle upload errors gracefully', async () => {
            const testCode = 'console.log("Hello World");';

            mockIPFS.add.mockRejectedValue(new Error('IPFS upload failed'));

            await expect(ipfsService.uploadApiCode(testCode))
                .rejects.toThrow('Failed to upload API code: IPFS upload failed');
        });

        it('should validate input code', async () => {
            await expect(ipfsService.uploadApiCode(null))
                .rejects.toThrow('Invalid code: must be a non-empty string');

            await expect(ipfsService.uploadApiCode(''))
                .rejects.toThrow('Invalid code: must be a non-empty string');

            await expect(ipfsService.uploadApiCode(123))
                .rejects.toThrow('Invalid code: must be a non-empty string');
        });
    });

    describe('getApiCode', () => {
        it('should retrieve code and validate integrity', async () => {
            const testCode = 'console.log("Hello World");';
            const contentHash = require('crypto')
                .createHash('sha256')
                .update(testCode)
                .digest('hex');

            const mockData = JSON.stringify({
                code: testCode,
                metadata: {
                    contentHash,
                    fileName: 'test.js',
                    uploadTimestamp: new Date().toISOString()
                }
            });

            mockIPFS.cat.mockReturnValue([Buffer.from(mockData)]);

            const result = await ipfsService.getApiCode('QmTestHash123456789', {
                validateIntegrity: true
            });

            expect(result).toBeDefined();
            expect(result.code).toBe(testCode);
            expect(result.metadata.contentHash).toBe(contentHash);
            expect(result.metadata.fileName).toBe('test.js');
        });

        it('should handle integrity validation failures', async () => {
            const testCode = 'console.log("Hello World");';
            const wrongHash = 'wronghash123';

            const mockData = JSON.stringify({
                code: testCode,
                metadata: {
                    contentHash: wrongHash,
                    fileName: 'test.js'
                }
            });

            mockIPFS.cat.mockReturnValue([Buffer.from(mockData)]);

            await expect(ipfsService.getApiCode('QmTestHash123456789', {
                validateIntegrity: true
            })).rejects.toThrow('Content integrity validation failed: hash mismatch');
        });

        it('should use cache when available', async () => {
            const testCode = 'console.log("Cached code");';
            const contentHash = require('crypto')
                .createHash('sha256')
                .update(testCode)
                .digest('hex');

            const mockData = {
                code: testCode,
                metadata: {
                    contentHash,
                    fileName: 'cached.js'
                }
            };

            // Mock cache hit
            const cacheFile = path.join(ipfsService.cacheDir, 'QmTestHash123456789.json');
            await fs.mkdir(ipfsService.cacheDir, { recursive: true });
            await fs.writeFile(cacheFile, JSON.stringify(mockData));

            const result = await ipfsService.getApiCode('QmTestHash123456789', {
                useCache: true
            });

            expect(result).toBeDefined();
            expect(result.code).toBe(testCode);

            // Cleanup
            await fs.unlink(cacheFile);
        });

        it('should fallback to cache if IPFS is slow', async () => {
            const testCode = 'console.log("Fallback code");';
            const contentHash = require('crypto')
                .createHash('sha256')
                .update(testCode)
                .digest('hex');

            const mockData = {
                code: testCode,
                metadata: {
                    contentHash,
                    fileName: 'fallback.js'
                }
            };

            // Mock cache with valid data
            const cacheFile = path.join(ipfsService.cacheDir, 'QmTestHash123456789.json');
            await fs.mkdir(ipfsService.cacheDir, { recursive: true });
            await fs.writeFile(cacheFile, JSON.stringify(mockData));

            // Mock IPFS timeout
            mockIPFS.cat.mockImplementation(() => {
                return new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('IPFS timeout')), 100);
                });
            });

            const result = await ipfsService.getApiCode('QmTestHash123456789', {
                useCache: true,
                timeout: 50
            });

            expect(result).toBeDefined();
            expect(result.code).toBe(testCode);

            // Cleanup
            await fs.unlink(cacheFile);
        });

        it('should handle retrieval errors', async () => {
            mockIPFS.cat.mockRejectedValue(new Error('IPFS retrieval failed'));

            await expect(ipfsService.getApiCode('QmTestHash123456789'))
                .rejects.toThrow('Failed to retrieve API code: IPFS retrieval failed');
        });
    });

    describe('CID validation', () => {
        it('should validate CID format correctly', () => {
            // Valid CIDs
            expect(ipfsService.validateCID('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(true);
            expect(ipfsService.validateCID('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')).toBe(true);

            // Invalid CIDs
            expect(ipfsService.validateCID('invalid-cid')).toBe(false);
            expect(ipfsService.validateCID('QmInvalid')).toBe(false);
            expect(ipfsService.validateCID('')).toBe(false);
            expect(ipfsService.validateCID(null)).toBe(false);
        });
    });

    describe('File operations', () => {
        it('should get file information', async () => {
            const mockInfo = {
                size: 1024,
                type: 'file',
                blocks: 1
            };

            mockIPFS.files.stat.mockResolvedValue(mockInfo);

            const info = await ipfsService.getFileInfo('QmTestHash123456789');

            expect(info).toBeDefined();
            expect(info.cid).toBe('QmTestHash123456789');
            expect(info.size).toBe(1024);
            expect(info.type).toBe('file');
        });

        it('should check content availability', async () => {
            mockIPFS.cat.mockResolvedValue([Buffer.from('test')]);

            const isAvailable = await ipfsService.isContentAvailable('QmTestHash123456789');

            expect(isAvailable).toBe(true);
        });

        it('should return false for unavailable content', async () => {
            mockIPFS.cat.mockRejectedValue(new Error('Content not found'));

            const isAvailable = await ipfsService.isContentAvailable('QmTestHash123456789');

            expect(isAvailable).toBe(false);
        });
    });

    describe('Pinning operations', () => {
        it('should pin content successfully', async () => {
            mockIPFS.pin.add.mockResolvedValue();

            await ipfsService.pinContent('QmTestHash123456789');

            expect(mockIPFS.pin.add).toHaveBeenCalledWith('QmTestHash123456789');
        });

        it('should unpin content successfully', async () => {
            mockIPFS.pin.rm.mockResolvedValue();

            await ipfsService.unpinContent('QmTestHash123456789');

            expect(mockIPFS.pin.rm).toHaveBeenCalledWith('QmTestHash123456789');
        });

        it('should handle pinning errors gracefully', async () => {
            mockIPFS.pin.add.mockRejectedValue(new Error('Pinning failed'));

            // Should not throw error
            await expect(ipfsService.pinContent('QmTestHash123456789')).resolves.toBeUndefined();
        });
    });

    describe('Cache operations', () => {
        it('should save and retrieve from cache', async () => {
            const testData = {
                code: 'console.log("cached");',
                metadata: { fileName: 'test.js' }
            };

            await ipfsService.saveToCache('QmTestHash123456789', testData);
            const cachedData = await ipfsService.getFromCache('QmTestHash123456789');

            expect(cachedData).toBeDefined();
            expect(cachedData.code).toBe(testData.code);
            expect(cachedData.metadata.fileName).toBe(testData.metadata.fileName);
        });

        it('should handle cache expiration', async () => {
            const testData = {
                code: 'console.log("expired");',
                metadata: { fileName: 'test.js' }
            };

            // Save with old timestamp
            const cacheFile = path.join(ipfsService.cacheDir, 'QmTestHash123456789.json');
            const oldData = {
                ...testData,
                _cachedAt: n
            });

        // Mock IPFS timeout
        mockIPFS.cat.mockImplementation(() => {
            return new Promise((_, reject) => {
                setTimeout(() => reject(new Error('IPFS timeout')), 100);
            });
        });

        const result = await ipfsService.getApiCode('QmTestHash123456789', {
            useCache: true,
            timeout: 50
        });

        expect(result).toBeDefined();
        expect(result.code).toBe(testCode);

        // Cleanup
        await fs.unlink(cacheFile);
    });
});

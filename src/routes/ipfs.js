const express = require('express');
const router = express.Router();
const multer = require('multer');
const ipfsService = require('../services/ipfs');
const { body, validationResult } = require('express-validator');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

/**
 * Upload API code to IPFS
 * POST /api/ipfs/upload
 */
router.post('/upload', upload.single('code'), [
    body('metadata').optional().isObject(),
    body('description').optional().isString().trim()
], async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const code = req.file.buffer.toString('utf8');
        const metadata = {
            fileName: req.file.originalname,
            contentType: req.file.mimetype,
            description: req.body.description,
            uploadedBy: req.user ? req.user.id : 'anonymous',
            uploadMethod: 'api',
            ...JSON.parse(req.body.metadata || '{}')
        };

        const result = await ipfsService.uploadApiCode(code, metadata);

        res.json({
            success: true,
            message: 'API code uploaded successfully',
            data: result
        });

    } catch (error) {
        console.error('Error uploading to IPFS:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload to IPFS',
            error: error.message
        });
    }
});

/**
 * Retrieve API code from IPFS
 * GET /api/ipfs/retrieve/:cid
 */
router.get('/retrieve/:cid', async (req, res) => {
    try {
        const { cid } = req.params;
        const { useCache = 'true', validateIntegrity = 'true', timeout = '30000' } = req.query;

        if (!ipfsService.validateCID(cid)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid CID format'
            });
        }

        const options = {
            useCache: useCache === 'true',
            validateIntegrity: validateIntegrity === 'true',
            timeout: parseInt(timeout)
        };

        const data = await ipfsService.getApiCode(cid, options);

        res.json({
            success: true,
            message: 'API code retrieved successfully',
            data: {
                cid,
                code: data.code,
                metadata: data.metadata
            }
        });

    } catch (error) {
        console.error('Error retrieving from IPFS:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve from IPFS',
            error: error.message
        });
    }
});

/**
 * Get file information
 * GET /api/ipfs/info/:cid
 */
router.get('/info/:cid', async (req, res) => {
    try {
        const { cid } = req.params;

        if (!ipfsService.validateCID(cid)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid CID format'
            });
        }

        const info = await ipfsService.getFileInfo(cid);
        const isAvailable = await ipfsService.isContentAvailable(cid);

        res.json({
            success: true,
            data: {
                ...info,
                isAvailable
            }
        });

    } catch (error) {
        console.error('Error getting file info:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get file info',
            error: error.message
        });
    }
});

/**
 * Pin content
 * POST /api/ipfs/pin/:cid
 */
router.post('/pin/:cid', async (req, res) => {
    try {
        const { cid } = req.params;

        if (!ipfsService.validateCID(cid)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid CID format'
            });
        }

        await ipfsService.pinContent(cid);

        res.json({
            success: true,
            message: 'Content pinned successfully'
        });

    } catch (error) {
        console.error('Error pinning content:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to pin content',
            error: error.message
        });
    }
});

/**
 * Unpin content
 * DELETE /api/ipfs/pin/:cid
 */
router.delete('/pin/:cid', async (req, res) => {
    try {
        const { cid } = req.params;

        if (!ipfsService.validateCID(cid)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid CID format'
            });
        }

        await ipfsService.unpinContent(cid);

        res.json({
            success: true,
            message: 'Content unpinned successfully'
        });

    } catch (error) {
        console.error('Error unpinning content:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unpin content',
            error: error.message
        });
    }
});

/**
 * Health check
 * GET /api/ipfs/health
 */
router.get('/health', async (req, res) => {
    try {
        const health = await ipfsService.healthCheck();
        res.json({
            success: true,
            data: health
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Health check failed',
            error: error.message
        });
    }
});

/**
 * Get cache statistics
 * GET /api/ipfs/cache/stats
 */
router.get('/cache/stats', async (req, res) => {
    try {
        const stats = await ipfsService.getCacheStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to get cache stats',
            error: error.message
        });
    }
});

/**
 * Clear cache
 * DELETE /api/ipfs/cache
 */
router.delete('/cache', async (req, res) => {
    try {
        await ipfsService.clearCache();
        res.json({
            success: true,
            message: 'Cache cleared successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to clear cache',
            error: error.message
        });
    }
});

/**
 * Validate CID
 * POST /api/ipfs/validate
 */
router.post('/validate', [
    body('cid').isString().notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { cid } = req.body;
        const isValid = ipfsService.validateCID(cid);
        const isAvailable = isValid ? await ipfsService.isContentAvailable(cid) : false;

        res.json({
            success: true,
            data: {
                cid,
                isValid,
                isAvailable
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Validation failed',
            error: error.message
        });
    }
});

module.exports = router; 
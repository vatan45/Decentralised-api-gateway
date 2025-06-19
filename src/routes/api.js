const express = require('express');
const router = express.Router();
const multer = require('multer');
const { check, validationResult } = require('express-validator');
const Api = require('../models/Api');
const { protect } = require('../middleware/auth');
const ipfsService = require('../services/ipfs');

// Configure multer for file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// @route   POST /api/apis
// @desc    Create a new API
// @access  Private
router.post('/', protect, [
    check('name', 'Name is required').not().isEmpty(),
    check('description', 'Description is required').not().isEmpty(),
    check('endpoints', 'At least one endpoint is required').isArray({ min: 1 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, description, endpoints } = req.body;

        const api = new Api({
            name,
            description,
            owner: req.user.id,
            endpoints,
            currentVersion: '1.0.0'
        });

        await api.save();

        res.status(201).json({
            success: true,
            data: api
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/apis/:id/upload
// @desc    Upload API code and create new version
// @access  Private
router.post('/:id/upload', protect, upload.single('code'), async (req, res) => {
    try {
        const api = await Api.findById(req.params.id);

        if (!api) {
            return res.status(404).json({
                success: false,
                message: 'API not found'
            });
        }

        // Check ownership
        if (api.owner.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        // Upload to IPFS
        const ipfsHash = await ipfsService.uploadFile(req.file.buffer);

        // Create new version
        const currentVersion = api.currentVersion;
        const [major, minor, patch] = currentVersion.split('.').map(Number);
        const newVersion = `${major}.${minor}.${patch + 1}`;

        api.versions.push({
            version: newVersion,
            ipfsHash,
            changes: req.body.changes || 'No changes specified'
        });

        api.currentVersion = newVersion;
        await api.save();

        res.json({
            success: true,
            data: {
                version: newVersion,
                ipfsHash
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PUT /api/apis/:id/endpoints/:endpointId
// @desc    Update endpoint pricing and status
// @access  Private
router.put('/:id/endpoints/:endpointId', protect, [
    check('price', 'Price is required').isNumeric(),
    check('isEnabled', 'isEnabled must be a boolean').isBoolean()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const api = await Api.findById(req.params.id);

        if (!api) {
            return res.status(404).json({
                success: false,
                message: 'API not found'
            });
        }

        // Check ownership
        if (api.owner.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        const endpoint = api.endpoints.id(req.params.endpointId);
        if (!endpoint) {
            return res.status(404).json({
                success: false,
                message: 'Endpoint not found'
            });
        }

        const { price, isEnabled } = req.body;
        endpoint.price = price;
        endpoint.isEnabled = isEnabled;

        await api.save();

        res.json({
            success: true,
            data: endpoint
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/apis
// @desc    Get all APIs for the current user
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const apis = await Api.find({ owner: req.user.id })
            .select('-versions')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: apis
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/apis/:id
// @desc    Get API details including version history
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const api = await Api.findById(req.params.id);

        if (!api) {
            return res.status(404).json({
                success: false,
                message: 'API not found'
            });
        }

        // Check ownership
        if (api.owner.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        res.json({
            success: true,
            data: api
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router; 
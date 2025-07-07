const express = require('express');
const router = express.Router();
const multer = require('multer');
const { check, validationResult } = require('express-validator');
const Api = require('../models/Api');
const { protect } = require('../middleware/auth');
const ipfsService = require('../services/ipfs');
const vm = require('vm');
const runtimeExecutor = require('../services/runtimeExecutor');

// Configure multer for file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Enhanced sandbox function with logging
async function runUserCodeInSandbox(code, query) {
    const sandbox = { query, result: null };
    vm.createContext(sandbox);
    try {
        console.log('[Sandbox] Running user code:', code);
        vm.runInContext(`
            result = (function(query) {
                ${code}
            }).call(this, query);
        `, sandbox, { timeout: 1000 });
        console.log('[Sandbox] Execution result:', sandbox.result);
        return sandbox.result;
    } catch (err) {
        console.error('[Sandbox] Error:', err);
        return { error: err.message };
    }
}

// @route   POST /api/apis
// @desc    Create a new API
// @access  Private
router.post('/apis', protect, [
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
router.post('/apis/:id/upload', protect, upload.single('code'), async (req, res) => {
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({
            success: false,
            message: 'No code file uploaded'
        });
    }
    const codeString = req.file.buffer.toString('utf8');
    if (!codeString) {
        return res.status(400).json({
            success: false,
            message: 'Uploaded code file is empty'
        });
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

        // Create new version
        const currentVersion = api.currentVersion;
        const [major, minor, patch] = currentVersion.split('.').map(Number);
        const newVersion = `${major}.${minor}.${patch + 1}`;

        api.versions.push({
            version: newVersion,
            code: codeString,
            changes: req.body.changes || 'No changes specified'
        });

        api.currentVersion = newVersion;
        await api.save();

        res.json({
            success: true,
            data: {
                version: newVersion,
                // ipfsHash: ipfsResult.cid // Remove this
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
router.get('/apis', protect, async (req, res) => {
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

// @route   POST /api/apis/:id/test
// @desc    Test an API endpoint by proxying the request
// @access  Private
router.post('/apis/:id/test', protect, async (req, res) => {
    try {
        const api = await Api.findById(req.params.id);
        if (!api) {
            return res.status(404).json({ success: false, message: 'API not found' });
        }
        if (api.owner.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const { method, endpoint, body, headers, query } = req.body;
        // Compose the URL to the actual API handler (adjust as needed)
        const apiUrl = `${process.env.API_BASE_URL || 'http://localhost:3000'}${endpoint}`;

        // Use fetch or axios to proxy the request
        const axios = require('axios');
        const response = await axios({
            url: apiUrl,
            method: method || 'POST',
            headers: headers || {},
            params: query || {},
            data: body || {},
            validateStatus: () => true // Forward all responses
        });

        res.status(response.status).json({
            success: true,
            data: {
                status: response.status,
                headers: response.headers,
                body: response.data
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/apis/:id/test
router.get('/apis/:id/test', protect, async (req, res) => {
    try {
        const api = await Api.findById(req.params.id);
        console.log('[DEBUG] API fetched:', api);

        if (!api) {
            console.log('[ERROR] API not found for id:', req.params.id);
            return res.status(404).json({ error: 'API not found' });
        }

        const latestVersion = api.versions[api.versions.length - 1];
        console.log('[DEBUG] Latest version:', latestVersion);

        if (!latestVersion) {
            console.log('[ERROR] No versions found for API id:', req.params.id);
            return res.status(404).json({ error: 'No versions found for this API' });
        }

        const code = latestVersion.code;
        console.log('[DEBUG] Code in latest version:', code);

        if (!code) {
            console.log('[ERROR] No code found in latest version for API id:', req.params.id);
            return res.status(404).json({ error: 'No code found for the latest version of this API' });
        }

        // Use Docker executor instead of sandbox
        const result = await runtimeExecutor.runCodeInDocker(code, req.query);

        if (result && result.error) {
            console.log('[ERROR] Error from Docker executor:', result.error);
            return res.status(400).json({ success: false, error: result.error });
        }
        // Return the actual result from Docker
        res.json(result);
    } catch (err) {
        console.log('[ERROR] Server error:', err.message);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

module.exports = router; 
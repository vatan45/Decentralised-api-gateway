const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// @route   POST /api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;

    try {
        let user = await User.findOne({ email });

        if (user) {
            return res.status(400).json({
                success: false,
                message: 'User already exists'
            });
        }

        user = new User({
            name,
            email,
            password
        });

        await user.save();

        const token = user.generateAuthToken();

        res.status(201).json({
            success: true,
            token
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
        let user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const token = user.generateAuthToken();

        res.json({
            success: true,
            token
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json({
            success: true,
            data: user
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/auth/api-key
// @desc    Generate API key
// @access  Private
router.post('/api-key', protect, [
    check('name', 'Name is required').not().isEmpty(),
    check('scopes', 'Scopes must be an array').isArray()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, scopes } = req.body;
        const apiKey = req.user.generateApiKey(name, scopes);
        await req.user.save();

        res.json({
            success: true,
            apiKey
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/auth/validate-key
// @desc    Validate API key for proxy
// @access  Public
router.post('/validate-key', async (req, res) => {
    const { apiKey, apiId } = req.body;

    if (!apiKey || !apiId) {
        return res.status(400).json({
            success: false,
            message: 'API key and API ID are required'
        });
    }

    try {
        // Find user by API key
        const user = await User.findOne({
            'apiKeys.key': apiKey,
            'apiKeys.isActive': true
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid API key'
            });
        }

        // Check if API key has access to the specific API
        const apiKeyData = user.apiKeys.find(key => key.key === apiKey);
        if (!apiKeyData.scopes.includes(apiId)) {
            return res.status(403).json({
                success: false,
                message: 'API key does not have access to this API'
            });
        }

        res.json({
            success: true,
            user_id: user._id.toString(),
            scopes: apiKeyData.scopes
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/auth/validate-token
// @desc    Validate JWT token for proxy
// @access  Public
router.post('/validate-token', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({
            success: false,
            message: 'Token is required'
        });
    }

    try {
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Find user
        const user = await User.findById(decoded.user.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        res.json({
            success: true,
            user_id: user._id.toString()
        });
    } catch (err) {
        console.error(err.message);
        res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
});

module.exports = router; 
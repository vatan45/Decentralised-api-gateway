const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
    level: {
        type: String,
        required: true,
        enum: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']
    },
    category: {
        type: String,
        required: true,
        enum: [
            'API_EXECUTION',
            'AUTHENTICATION',
            'BILLING',
            'IPFS',
            'DATABASE',
            'SYSTEM',
            'SECURITY',
            'PERFORMANCE'
        ]
    },
    message: {
        type: String,
        required: true
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    apiId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Api'
    },
    executionId: {
        type: String
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
systemLogSchema.index({ level: 1, timestamp: -1 });
systemLogSchema.index({ category: 1, timestamp: -1 });
systemLogSchema.index({ userId: 1, timestamp: -1 });
systemLogSchema.index({ apiId: 1, timestamp: -1 });
systemLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 }); // 30 days TTL

module.exports = mongoose.model('SystemLog', systemLogSchema); 
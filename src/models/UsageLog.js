const mongoose = require('mongoose');

const usageLogSchema = new mongoose.Schema({
    apiId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Api',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    endpoint: {
        type: String,
        required: true
    },
    method: {
        type: String,
        required: true,
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    },
    timestamp: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    },
    duration: {
        type: Number,
        required: true,
        min: 0 // milliseconds
    },
    bytesIn: {
        type: Number,
        required: true,
        min: 0
    },
    bytesOut: {
        type: Number,
        required: true,
        min: 0
    },
    statusCode: {
        type: Number,
        required: true
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    apiKey: {
        type: String
    },
    executionId: {
        type: String
    },
    cost: {
        type: Number,
        default: 0
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Compound indexes for efficient querying
usageLogSchema.index({ userId: 1, apiId: 1, timestamp: -1 });
usageLogSchema.index({ apiId: 1, timestamp: -1 });
usageLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // 90 days TTL

module.exports = mongoose.model('UsageLog', usageLogSchema);
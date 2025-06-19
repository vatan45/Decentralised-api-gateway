const mongoose = require('mongoose');

const usageSnapshotSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    apiId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Api',
        required: true,
        index: true
    },
    period: {
        type: String,
        required: true,
        enum: ['hourly', 'daily', 'monthly'],
        index: true
    },
    periodStart: {
        type: Date,
        required: true,
        index: true
    },
    periodEnd: {
        type: Date,
        required: true
    },
    requestCount: {
        type: Number,
        default: 0
    },
    totalDuration: {
        type: Number,
        default: 0 // milliseconds
    },
    totalBytesIn: {
        type: Number,
        default: 0
    },
    totalBytesOut: {
        type: Number,
        default: 0
    },
    totalCost: {
        type: Number,
        default: 0
    },
    averageDuration: {
        type: Number,
        default: 0
    },
    errorCount: {
        type: Number,
        default: 0
    },
    successCount: {
        type: Number,
        default: 0
    },
    statusCodes: {
        type: Map,
        of: Number,
        default: new Map()
    },
    endpoints: {
        type: Map,
        of: Number,
        default: new Map()
    }
}, {
    timestamps: true
});

// Compound indexes for efficient aggregation queries
usageSnapshotSchema.index({ userId: 1, apiId: 1, period: 1, periodStart: -1 });
usageSnapshotSchema.index({ period: 1, periodStart: -1 });

module.exports = mongoose.model('UsageSnapshot', usageSnapshotSchema);
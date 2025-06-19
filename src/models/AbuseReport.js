const mongoose = require('mongoose');

const abuseReportSchema = new mongoose.Schema({
    reporterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    targetType: {
        type: String,
        required: true,
        enum: ['API', 'USER']
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'targetModel',
        required: true
    },
    targetModel: {
        type: String,
        enum: ['Api', 'User']
    },
    reason: {
        type: String,
        required: true,
        enum: [
            'MALICIOUS_CODE',
            'SPAM',
            'INAPPROPRIATE_CONTENT',
            'COPYRIGHT_VIOLATION',
            'RATE_LIMIT_ABUSE',
            'RESOURCE_ABUSE',
            'SECURITY_VIOLATION',
            'OTHER'
        ]
    },
    description: {
        type: String,
        required: true,
        maxlength: 1000
    },
    evidence: [{
        type: String,
        maxlength: 500
    }],
    status: {
        type: String,
        enum: ['PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'],
        default: 'PENDING'
    },
    priority: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        default: 'MEDIUM'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    resolution: {
        action: {
            type: String,
            enum: ['WARNING', 'SUSPENSION', 'BLOCK', 'NO_ACTION']
        },
        notes: String,
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        resolvedAt: Date
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Indexes
abuseReportSchema.index({ status: 1, priority: 1, timestamp: -1 });
abuseReportSchema.index({ targetType: 1, targetId: 1 });
abuseReportSchema.index({ reporterId: 1, timestamp: -1 });
abuseReportSchema.index({ assignedTo: 1, status: 1 });

module.exports = mongoose.model('AbuseReport', abuseReportSchema); 
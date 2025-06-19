const mongoose = require('mongoose');

const adminLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        enum: [
            'API_BLOCKED',
            'API_UNBLOCKED',
            'USER_SUSPENDED',
            'USER_UNSUSPENDED',
            'ABUSE_FLAGGED',
            'REVENUE_REPORT_GENERATED',
            'SYSTEM_MAINTENANCE',
            'CONFIGURATION_CHANGED'
        ]
    },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    targetType: {
        type: String,
        required: true,
        enum: ['API', 'USER', 'SYSTEM', 'GENERAL']
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'targetModel'
    },
    targetModel: {
        type: String,
        enum: ['Api', 'User']
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    severity: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        default: 'MEDIUM'
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
adminLogSchema.index({ action: 1, timestamp: -1 });
adminLogSchema.index({ adminId: 1, timestamp: -1 });
adminLogSchema.index({ targetType: 1, targetId: 1 });
adminLogSchema.index({ severity: 1, timestamp: -1 });

module.exports = mongoose.model('AdminLog', adminLogSchema); 
const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema({
    version: {
        type: String,
        required: true
    },
    ipfsHash: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    changes: {
        type: String,
        required: true
    }
});

const endpointSchema = new mongoose.Schema({
    path: {
        type: String,
        required: true
    },
    method: {
        type: String,
        required: true,
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    isEnabled: {
        type: Boolean,
        default: true
    },
    description: String,
    parameters: [{
        name: String,
        type: String,
        required: Boolean,
        description: String
    }]
});

const apiSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization'
    },
    endpoints: [endpointSchema],
    versions: [versionSchema],
    currentVersion: {
        type: String,
        required: true
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
apiSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Api', apiSchema); 
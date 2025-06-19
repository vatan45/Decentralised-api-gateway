const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/database');
const billingWorker = require('./services/billingWorker');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Body parser
app.use(express.json());

// Enable CORS
app.use(cors());

// Mount routers
app.use('/api/auth', require('./routes/auth'));
app.use('/api/apis', require('./routes/api'));
app.use('/api/executor', require('./routes/executor'));
app.use('/api/usage', require('./routes/usage'));
app.use('/api/ipfs', require('./routes/ipfs'));
app.use('/api/admin', require('./routes/admin'));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!'
    });
});

const PORT = process.env.PORT || 5006;

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);

    // Start billing worker
    try {
        await billingWorker.start();
        console.log('Billing worker started successfully');
    } catch (error) {
        console.error('Failed to start billing worker:', error);
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    billingWorker.stop();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    billingWorker.stop();
    process.exit(0);
}); 
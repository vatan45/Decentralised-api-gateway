const usageMeteringService = require('../services/usageMetering');

/**
 * Middleware to track API usage
 */
const trackUsage = (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    const originalJson = res.json;

    // Capture request data
    const requestData = {
        url: req.originalUrl,
        method: req.method,
        headers: req.headers,
        body: req.body,
        query: req.query,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    };

    // Override res.send to capture response
    res.send = function (data) {
        const duration = Date.now() - startTime;

        // Log usage asynchronously (don't block response)
        setImmediate(async () => {
            try {
                await usageMeteringService.logUsage({
                    apiId: req.apiId,
                    userId: req.userId,
                    endpoint: req.originalUrl,
                    method: req.method,
                    duration,
                    statusCode: res.statusCode,
                    request: requestData,
                    response: { body: data, headers: res.getHeaders() },
                    ipAddress: requestData.ipAddress,
                    userAgent: requestData.userAgent,
                    apiKey: req.apiKey,
                    executionId: req.executionId
                });
            } catch (error) {
                console.error('Error tracking usage:', error);
            }
        });

        return originalSend.call(this, data);
    };

    // Override res.json to capture JSON response
    res.json = function (data) {
        const duration = Date.now() - startTime;

        // Log usage asynchronously (don't block response)
        setImmediate(async () => {
            try {
                await usageMeteringService.logUsage({
                    apiId: req.apiId,
                    userId: req.userId,
                    endpoint: req.originalUrl,
                    method: req.method,
                    duration,
                    statusCode: res.statusCode,
                    request: requestData,
                    response: { body: data, headers: res.getHeaders() },
                    ipAddress: requestData.ipAddress,
                    userAgent: requestData.userAgent,
                    apiKey: req.apiKey,
                    executionId: req.executionId
                });
            } catch (error) {
                console.error('Error tracking usage:', error);
            }
        });

        return originalJson.call(this, data);
    };

    next();
};

module.exports = { trackUsage }; 
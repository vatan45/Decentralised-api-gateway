# API Gateway Proxy

A high-performance API Gateway Proxy built in Go that routes external requests to user APIs securely with authentication, logging, and monitoring capabilities.

## 🚀 Features

- **Reverse Proxy**: Routes requests to appropriate API executors
- **Authentication**: Supports both API Key and JWT token validation
- **Request Logging**: Comprehensive logging with Redis for analytics
- **Rate Limiting**: Built-in rate limiting per user/API
- **Monitoring**: Real-time metrics and health checks
- **Security**: Request validation and sanitization
- **Scalability**: Horizontal scaling with Redis and MongoDB

## 🏗️ Architecture

┌─────────────────┐ ┌──────────────────┐ ┌─────────────────┐
│ Client App │───▶│ API Gateway │───▶│ API Executor │
│ │ │ Proxy (Go) │ │ (Node.js) │
└─────────────────┘ └──────────────────┘ └─────────────────┘
│
▼
┌──────────────────┐
│ Auth Service │
│ (Node.js) │
└──────────────────┘
│
▼
┌──────────────────┐
│ MongoDB │
│ Redis │
└────────
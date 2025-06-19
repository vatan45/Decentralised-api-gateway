# API Authentication Service

A robust authentication service that provides user management, JWT authentication, and API key generation.

## Features

- User registration and login
- JWT token generation (short-term)
- API key generation (long-term)
- Protected routes
- Organization support
- API key scoping

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/api-auth
JWT_SECRET=your_jwt_secret_key_here
NODE_ENV=development
```

3. Start the server:
```bash
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
  - Body: `{ "name": "string", "email": "string", "password": "string" }`

- `POST /api/auth/login` - Login user
  - Body: `{ "email": "string", "password": "string" }`

- `GET /api/auth/me` - Get current user
  - Headers: `Authorization: Bearer <token>`

- `POST /api/auth/api-key` - Generate API key
  - Headers: `Authorization: Bearer <token>`
  - Body: `{ "name": "string", "scopes": ["string"] }`

## Security Features

- Password hashing using bcrypt
- JWT token expiration
- API key scoping
- Protected routes
- Input validation
- Error handling


## 📋 Prerequisites

- Go 1.21+
- MongoDB
- Redis
- Node.js (for auth service)

## 🛠️ Installation

1. **Clone and navigate to the proxy directory:**
   ```bash
   cd proxy
   ```

2. **Install dependencies:**
   ```bash
   go mod download
   ```

3. **Set environment variables:**
   ```bash
   export MONGO_URI="mongodb://localhost:27017"
   export REDIS_URI="redis://localhost:6379"
   export EXECUTOR_URL="http://localhost:3001"
   export PROXY_PORT="8080"
   ```

4. **Run the proxy:**
   ```bash
   go run main.go
   ```

## 🐳 Docker Deployment

1. **Build the image:**
   ```bash
   docker build -t api-gateway-proxy .
   ```

2. **Run with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

## 📡 API Usage

### Request Format



## Testing

To run tests:
```bash
npm test
```

## License

MIT 
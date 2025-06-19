.PHONY: build run test clean docker-build docker-run

# Build the application
build:
	go build -o bin/proxy main.go

# Run the application
run:
	go run main.go

# Run tests
test:
	go test ./...

# Run tests with coverage
test-coverage:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out

# Clean build artifacts
clean:
	rm -rf bin/
	rm -f coverage.out

# Build Docker image
docker-build:
	docker build -t api-gateway-proxy .

# Run Docker container
docker-run:
	docker run -p 8080:8080 \
		-e MONGO_URI=mongodb://localhost:27017 \
		-e REDIS_URI=redis://localhost:6379 \
		-e EXECUTOR_URL=http://localhost:3001 \
		api-gateway-proxy

# Run with Docker Compose
docker-compose-up:
	docker-compose up -d

# Stop Docker Compose
docker-compose-down:
	docker-compose down

# Install dependencies
deps:
	go mod download

# Format code
fmt:
	go fmt ./...

# Lint code
lint:
	golangci-lint run

# Generate mocks (if using mockery)
mocks:
	mockery --all

# Development setup
dev-setup: deps fmt lint test 
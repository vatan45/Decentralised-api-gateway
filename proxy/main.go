package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// API represents the API model from MongoDB
type API struct {
	ID             string     `bson:"_id" json:"id"`
	Name           string     `bson:"name" json:"name"`
	Description    string     `bson:"description" json:"description"`
	Owner          string     `bson:"owner" json:"owner"`
	Organization   string     `bson:"organization" json:"organization"`
	Endpoints      []Endpoint `bson:"endpoints" json:"endpoints"`
	CurrentVersion string     `bson:"currentVersion" json:"currentVersion"`
	IsPublic       bool       `bson:"isPublic" json:"isPublic"`
	CreatedAt      time.Time  `bson:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time  `bson:"updatedAt" json:"updatedAt"`
}

// Endpoint represents an API endpoint
type Endpoint struct {
	Path        string `bson:"path" json:"path"`
	Method      string `bson:"method" json:"method"`
	Price       int    `bson:"price" json:"price"`
	IsEnabled   bool   `bson:"isEnabled" json:"isEnabled"`
	Description string `bson:"description" json:"description"`
}

// RequestLog represents a logged request
type RequestLog struct {
	UserID       string    `json:"user_id"`
	APIID        string    `json:"api_id"`
	Endpoint     string    `json:"endpoint"`
	Method       string    `json:"method"`
	IP           string    `json:"ip"`
	Timestamp    time.Time `json:"timestamp"`
	Status       int       `json:"status"`
	ResponseTime int64     `json:"response_time"`
}

// Config holds application configuration
type Config struct {
	MongoURI    string
	RedisURI    string
	ExecutorURL string
	Port        string
}

var (
	config      Config
	mongoClient *mongo.Client
	redisClient *redis.Client
)

func main() {
	// Load configuration
	config = Config{
		MongoURI:    getEnv("MONGO_URI", "mongodb://localhost:27017"),
		RedisURI:    getEnv("REDIS_URI", "redis://localhost:6379"),
		ExecutorURL: getEnv("EXECUTOR_URL", "http://localhost:3001"),
		Port:        getEnv("PROXY_PORT", "8080"),
	}

	// Initialize MongoDB connection
	initMongoDB()
	defer mongoClient.Disconnect(context.Background())

	// Initialize Redis connection
	initRedis()
	defer redisClient.Close()

	// Setup Gin router
	router := gin.Default()

	// Add middleware
	router.Use(gin.Logger())
	router.Use(gin.Recovery())

	// Setup proxy routes
	setupProxyRoutes(router)

	// Start server
	log.Printf("API Gateway Proxy starting on port %s", config.Port)
	if err := router.Run(":" + config.Port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func initMongoDB() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(config.MongoURI))
	if err != nil {
		log.Fatal("Failed to connect to MongoDB:", err)
	}

	// Test connection
	err = client.Ping(ctx, nil)
	if err != nil {
		log.Fatal("Failed to ping MongoDB:", err)
	}

	mongoClient = client
	log.Println("Connected to MongoDB")
}

func initRedis() {
	opt, err := redis.ParseURL(config.RedisURI)
	if err != nil {
		log.Fatal("Failed to parse Redis URL:", err)
	}

	redisClient = redis.NewClient(opt)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = redisClient.Ping(ctx).Result()
	if err != nil {
		log.Fatal("Failed to connect to Redis:", err)
	}

	log.Println("Connected to Redis")
}

func setupProxyRoutes(router *gin.Engine) {
	// Catch-all route for API proxying
	router.Any("/api/:apiName/*path", proxyHandler)

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy"})
	})
}

func proxyHandler(c *gin.Context) {
	startTime := time.Now()

	apiName := c.Param("apiName")
	path := c.Param("path")
	method := c.Request.Method
	clientIP := c.ClientIP()

	// Get API metadata from database
	api, err := getAPIMetadata(apiName)
	if err != nil {
		c.JSON(404, gin.H{
			"success": false,
			"message": "API not found",
		})
		return
	}

	// Find matching endpoint
	endpoint, found := findMatchingEndpoint(api, path, method)
	if !found {
		c.JSON(404, gin.H{
			"success": false,
			"message": "Endpoint not found",
		})
		return
	}

	// Validate authentication
	userID, err := validateAuth(c, api)
	if err != nil {
		c.JSON(401, gin.H{
			"success": false,
			"message": "Authentication required",
		})
		return
	}

	// Forward request to executor
	response, err := forwardRequest(c, api, endpoint)
	if err != nil {
		c.JSON(500, gin.H{
			"success": false,
			"message": "Failed to forward request",
		})
		return
	}

	// Log request
	go logRequest(RequestLog{
		UserID:       userID,
		APIID:        api.ID,
		Endpoint:     path,
		Method:       method,
		IP:           clientIP,
		Timestamp:    time.Now(),
		Status:       response.StatusCode,
		ResponseTime: time.Since(startTime).Milliseconds(),
	})

	// Return response
	c.DataFromReader(response.StatusCode, response.ContentLength, response.Header.Get("Content-Type"), response.Body, nil)
}

func getAPIMetadata(apiName string) (*API, error) {
	collection := mongoClient.Database("api_auth_service").Collection("apis")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var api API
	err := collection.FindOne(ctx, bson.M{"name": apiName}).Decode(&api)
	if err != nil {
		return nil, err
	}

	return &api, nil
}

func findMatchingEndpoint(api *API, path, method string) (*Endpoint, bool) {
	for _, endpoint := range api.Endpoints {
		if endpoint.Path == path && endpoint.Method == method && endpoint.IsEnabled {
			return &endpoint, true
		}
	}
	return nil, false
}

func validateAuth(c *gin.Context, api *API) (string, error) {
	// Check for API key in header
	apiKey := c.GetHeader("X-API-Key")
	if apiKey != "" {
		return validateAPIKey(apiKey, api)
	}

	// Check for JWT token in header
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		return validateJWT(token, api)
	}

	// If API is public, allow access
	if api.IsPublic {
		return "anonymous", nil
	}

	return "", fmt.Errorf("authentication required")
}

func validateAPIKey(apiKey string, api *API) (string, error) {
	// In a real implementation, you would validate the API key against your database
	// For now, we'll make a request to your Node.js auth service
	url := "http://localhost:5000/api/auth/validate-key"

	req, err := http.NewRequest("POST", url, strings.NewReader(fmt.Sprintf(`{"apiKey": "%s", "apiId": "%s"}`, apiKey, api.ID)))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("invalid API key")
	}

	// Parse response to get user ID
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if userID, ok := result["user_id"].(string); ok {
		return userID, nil
	}

	return "", fmt.Errorf("invalid response format")
}

func validateJWT(token string, api *API) (string, error) {
	// In a real implementation, you would validate the JWT token
	// For now, we'll make a request to your Node.js auth service
	url := "http://localhost:5000/api/auth/validate-token"

	req, err := http.NewRequest("POST", url, strings.NewReader(fmt.Sprintf(`{"token": "%s"}`, token)))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("invalid JWT token")
	}

	// Parse response to get user ID
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if userID, ok := result["user_id"].(string); ok {
		return userID, nil
	}

	return "", fmt.Errorf("invalid response format")
}

func forwardRequest(c *gin.Context, api *API, endpoint *Endpoint) (*http.Response, error) {
	// Construct executor URL
	executorURL := fmt.Sprintf("%s/execute/%s%s", config.ExecutorURL, api.ID, c.Request.URL.Path)

	// Create new request
	req, err := http.NewRequest(c.Request.Method, executorURL, c.Request.Body)
	if err != nil {
		return nil, err
	}

	// Copy headers
	for key, values := range c.Request.Header {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	// Add API metadata headers
	req.Header.Set("X-API-ID", api.ID)
	req.Header.Set("X-API-Version", api.CurrentVersion)
	req.Header.Set("X-Endpoint-Price", fmt.Sprintf("%d", endpoint.Price))

	// Make request
	client := &http.Client{Timeout: 30 * time.Second}
	return client.Do(req)
}

func logRequest(logEntry RequestLog) {
	// Log to Redis for real-time analytics
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	logData, _ := json.Marshal(logEntry)
	redisClient.LPush(ctx, "api_requests", logData)

	// Also log to console for debugging
	log.Printf("Request: %s %s %s - Status: %d - Time: %dms",
		logEntry.Method, logEntry.APIID, logEntry.Endpoint,
		logEntry.Status, logEntry.ResponseTime)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

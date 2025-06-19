package tests

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestProxyHandler(t *testing.T) {
	// Set Gin to test mode
	gin.SetMode(gin.TestMode)

	// Create a test router
	router := gin.New()
	router.Any("/api/:apiName/*path", func(c *gin.Context) {
		// Mock proxy handler logic
		apiName := c.Param("apiName")
		path := c.Param("path")

		if apiName == "test-api" && path == "/users" {
			c.JSON(200, gin.H{"message": "success"})
		} else {
			c.JSON(404, gin.H{"message": "API not found"})
		}
	})

	// Test successful request
	t.Run("Successful API Request", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/test-api/users", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, 200, w.Code)
		assert.Contains(t, w.Body.String(), "success")
	})

	// Test API not found
	t.Run("API Not Found", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/nonexistent-api/users", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, 404, w.Code)
		assert.Contains(t, w.Body.String(), "API not found")
	})
}

func TestAuthValidation(t *testing.T) {
	// Test API key validation
	t.Run("Valid API Key", func(t *testing.T) {
		// Mock API key validation
		valid := validateAPIKey("valid-key", "test-api")
		assert.True(t, valid)
	})

	// Test invalid API key
	t.Run("Invalid API Key", func(t *testing.T) {
		valid := validateAPIKey("invalid-key", "test-api")
		assert.False(t, valid)
	})

	// Test missing API key
	t.Run("Missing API Key", func(t *testing.T) {
		valid := validateAPIKey("", "test-api")
		assert.False(t, valid)
	})
}

func TestEndpointMatching(t *testing.T) {
	// Test endpoint matching
	t.Run("Matching Endpoint", func(t *testing.T) {
		endpoints := []struct {
			Path   string
			Method string
		}{
			{"/users", "GET"},
			{"/users", "POST"},
			{"/users/:id", "GET"},
		}

		matched := findMatchingEndpoint(endpoints, "/users", "GET")
		assert.True(t, matched)
	})

	// Test non-matching endpoint
	t.Run("Non-matching Endpoint", func(t *testing.T) {
		endpoints := []struct {
			Path   string
			Method string
		}{
			{"/users", "GET"},
		}

		matched := findMatchingEndpoint(endpoints, "/posts", "GET")
		assert.False(t, matched)
	})
}

// Helper functions for testing
func validateAPIKey(apiKey, apiID string) bool {
	// Mock validation logic
	return apiKey == "valid-key" && apiID == "test-api"
}

func findMatchingEndpoint(endpoints []struct {
	Path   string
	Method string
}, path, method string) bool {
	for _, endpoint := range endpoints {
		if endpoint.Path == path && endpoint.Method == method {
			return true
		}
	}
	return false
}

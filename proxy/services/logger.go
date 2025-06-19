package services

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/go-redis/redis/v8"
)

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
	UserAgent    string    `json:"user_agent"`
	RequestSize  int64     `json:"request_size"`
	ResponseSize int64     `json:"response_size"`
}

// LoggerService handles request logging
type LoggerService struct {
	redisClient *redis.Client
}

// NewLoggerService creates a new logger service
func NewLoggerService(redisClient *redis.Client) *LoggerService {
	return &LoggerService{
		redisClient: redisClient,
	}
}

// LogRequest logs a request to Redis and console
func (l *LoggerService) LogRequest(logEntry RequestLog) {
	// Log to Redis for real-time analytics
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	logData, _ := json.Marshal(logEntry)

	// Store in Redis list for recent requests
	l.redisClient.LPush(ctx, "api_requests", logData)

	// Keep only last 1000 requests
	l.redisClient.LTrim(ctx, "api_requests", 0, 999)

	// Store in Redis hash for analytics
	dateKey := logEntry.Timestamp.Format("2006-01-02")
	hourKey := logEntry.Timestamp.Format("15")

	// Increment daily stats
	l.redisClient.HIncrBy(ctx, "stats:daily:"+dateKey, "total_requests", 1)
	l.redisClient.HIncrBy(ctx, "stats:daily:"+dateKey, "total_response_time", logEntry.ResponseTime)

	// Increment hourly stats
	l.redisClient.HIncrBy(ctx, "stats:hourly:"+dateKey+":"+hourKey, "total_requests", 1)
	l.redisClient.HIncrBy(ctx, "stats:hourly:"+dateKey+":"+hourKey, "total_response_time", logEntry.ResponseTime)

	// Log to console for debugging
	log.Printf("Request: %s %s %s - User: %s - Status: %d - Time: %dms - IP: %s",
		logEntry.Method, logEntry.APIID, logEntry.Endpoint,
		logEntry.UserID, logEntry.Status, logEntry.ResponseTime, logEntry.IP)
}

// GetRecentRequests gets recent requests from Redis
func (l *LoggerService) GetRecentRequests(limit int64) ([]RequestLog, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	results, err := l.redisClient.LRange(ctx, "api_requests", 0, limit-1).Result()
	if err != nil {
		return nil, err
	}

	var logs []RequestLog
	for _, result := range results {
		var logEntry RequestLog
		if err := json.Unmarshal([]byte(result), &logEntry); err != nil {
			continue
		}
		logs = append(logs, logEntry)
	}

	return logs, nil
}

// GetStats gets statistics for a given date
func (l *LoggerService) GetStats(date string) (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	stats, err := l.redisClient.HGetAll(ctx, "stats:daily:"+date).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"date":              date,
		"total_requests":    stats["total_requests"],
		"avg_response_time": stats["total_response_time"],
	}, nil
}

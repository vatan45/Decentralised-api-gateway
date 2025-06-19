package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// AuthHandler handles authentication validation
type AuthHandler struct {
	AuthServiceURL string
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(authServiceURL string) *AuthHandler {
	return &AuthHandler{
		AuthServiceURL: authServiceURL,
	}
}

// ValidateAPIKey validates an API key
func (h *AuthHandler) ValidateAPIKey(apiKey, apiID string) (string, error) {
	url := fmt.Sprintf("%s/api/auth/validate-key", h.AuthServiceURL)

	payload := map[string]string{
		"apiKey": apiKey,
		"apiId":  apiID,
	}

	jsonData, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", url, strings.NewReader(string(jsonData)))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("invalid API key")
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if userID, ok := result["user_id"].(string); ok {
		return userID, nil
	}

	return "", fmt.Errorf("invalid response format")
}

// ValidateJWT validates a JWT token
func (h *AuthHandler) ValidateJWT(token string) (string, error) {
	url := fmt.Sprintf("%s/api/auth/validate-token", h.AuthServiceURL)

	payload := map[string]string{
		"token": token,
	}

	jsonData, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", url, strings.NewReader(string(jsonData)))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("invalid JWT token")
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if userID, ok := result["user_id"].(string); ok {
		return userID, nil
	}

	return "", fmt.Errorf("invalid response format")
}

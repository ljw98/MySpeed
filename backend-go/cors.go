package main

import "net/http"

// handleCORS writes CORS headers when the ?cors query parameter is present
// and returns true if the request was an OPTIONS preflight (already handled).
// Callers should return early when this returns true.
func handleCORS(w http.ResponseWriter, r *http.Request) bool {
	if !r.URL.Query().Has("cors") {
		return false
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return true
	}
	return false
}
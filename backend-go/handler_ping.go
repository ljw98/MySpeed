package main

import "net/http"

// handlePing returns a minimal response body so the client can measure RTT.
// Split from handleUpload for single-responsibility routing: upload drains
// a POST body, ping just replies.
func handlePing(w http.ResponseWriter, r *http.Request) {
	if handleCORS(w, r) {
		return
	}
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_ = handleCORS(w, r) // headers only; OPTIONS already handled above
	_, _ = w.Write([]byte("{}"))
}

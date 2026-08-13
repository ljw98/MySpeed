package main

import (
	"io"
	"net/http"
)

// handleUpload accepts a POST body and discards it. The body must be
// drained so the connection can be reused for the next request (keep-alive).
func handleUpload(w http.ResponseWriter, r *http.Request) {
	if handleCORS(w, r) {
		return
	}
	_, _ = io.Copy(io.Discard, r.Body)
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_ = handleCORS(w, r) // headers only; OPTIONS already handled above
	_, _ = w.Write([]byte("{}"))
}

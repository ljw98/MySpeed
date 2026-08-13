package main

import (
	"net/http"
	"strconv"
)

// downloadData is a pre-filled 1 MiB deterministic buffer, generated once
// at startup and cycled across requests — no per-request alloc cost.
// Uses a deterministic pattern (not crypto/rand) since the data is used
// purely for bandwidth measurement, not for security.
var downloadData = makeDownloadBuffer()

func makeDownloadBuffer() []byte {
	buf := make([]byte, 1<<20) // 1 MiB
	for i := range buf {
		buf[i] = byte(i * 73 & 0xff)
	}
	return buf
}

func handleDownload(w http.ResponseWriter, r *http.Request) {
	if handleCORS(w, r) {
		return
	}
	chunks := parseChunkParam(r)
	applyDownloadHeaders(w, r)
	flusher, _ := w.(http.Flusher)
	for i := 0; i < chunks; i++ {
		_, _ = w.Write(downloadData)
		if flusher != nil {
			flusher.Flush()
		}
	}
}

// parseChunkParam reads ?chunks= (MiB of data to emit). Bounds:
// default 4, max 1024, non-positive or malformed → default.
func parseChunkParam(r *http.Request) int {
	raw := r.URL.Query().Get("chunks")
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return 4
	}
	if n > 1024 {
		return 1024
	}
	return n
}

func applyDownloadHeaders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=random.dat")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_ = handleCORS(w, r) // headers only; OPTIONS already handled above
}

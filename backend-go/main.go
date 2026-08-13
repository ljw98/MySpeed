package main

import (
	"compress/gzip"
	"context"
	"embed"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

//go:embed static
var staticFiles embed.FS

// ctxKey is unexported so no outside package can collide.
type ctxKey struct{}

func configFromContext(r *http.Request) Config {
	if v, ok := r.Context().Value(ctxKey{}).(Config); ok {
		return v
	}
	return Load()
}

func main() {
	cfg := Load()

	mux := http.NewServeMux()

	// API namespace — distinct from static files so a reverse proxy can
	// split on /api/ and so there's no clash with embedded asset paths.
	mux.HandleFunc("/api/download", handleDownload)
	mux.HandleFunc("/api/upload", handleUpload)
	mux.HandleFunc("/api/ping", handlePing)
	mux.HandleFunc("/api/ipinfo", handleIPInfo)

	// Static files: embed in production, disk in dev.
	// Check if the embed directory exists (it will be present after
	// `cp -r frontend/dist backend-go/static` in the builder).
	var staticHandler http.Handler
	if _, err := fs.Stat(staticFiles, "static"); err == nil {
		// Production: serve from embed.FS, stripping the "static" prefix.
		sub, err := fs.Sub(staticFiles, "static")
		if err != nil {
			log.Fatalf("static sub: %v", err)
		}
		staticHandler = http.FileServer(http.FS(sub))
	} else {
		// Development: serve from disk (frontend/dist/).
		staticDir := os.Getenv("STATIC_DIR")
		if staticDir == "" {
			staticDir = "../frontend/dist"
		}
		log.Printf("dev mode: serving static files from %s", staticDir)
		staticHandler = http.FileServer(http.Dir(staticDir))
	}

	// Catch-all: serve static files (single-page app; no client-side routing).
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Only GET/HEAD.
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "405 method not allowed", http.StatusMethodNotAllowed)
			return
		}
		// Security headers.
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'")
		// Cache headers: hashed assets are immutable and cached long-term;
		// index.html revalidates so a new deployments propagates.
		p := r.URL.Path
		switch {
		case strings.HasPrefix(p, "/assets/"):
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		default:
			w.Header().Set("Cache-Control", "no-cache")
		}
		// Serve the exact path; root serves index.html.
		staticHandler.ServeHTTP(w, r)
	})

	// Inject config into request context so handlers don't read globals.
	var handler http.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), ctxKey{}, cfg)
		mux.ServeHTTP(w, r.WithContext(ctx))
	})

	// gzipCompress wraps a handler to gzip-compress text responses when the
	// client advertises gzip support. Compressible types only; passes through
	// images/binaries untouched.
	handler = gzipCompress(handler)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		// Reap idle keep-alive connections so a slow client can't pin a
		// goroutine forever. WriteTimeout stays 0 (unlimited): speed tests
		// legitimately hold a connection open for many seconds.
		IdleTimeout: 120 * time.Second,
	}

	go func() {
		log.Printf("MySpeed listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Println("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

// gzipResponseWriter defers the real WriteHeader until the first Write so it
// can decide — based on Content-Type — whether to gzip before headers are
// committed. Binary/download responses pass through untouched (no buffering).
type gzipResponseWriter struct {
	rw           http.ResponseWriter
	w            io.Writer // sink: either rw or a gzip.Writer wrapping rw
	status       int
	headerSent   bool
	bodyStarted  bool
	compressible bool
}

func (g *gzipResponseWriter) Header() http.Header { return g.rw.Header() }

// WriteHeader records the status but does not forward it yet; see Write.
func (g *gzipResponseWriter) WriteHeader(code int) {
	g.status = code
	g.headerSent = true
}

func (g *gzipResponseWriter) Write(b []byte) (int, error) {
	if !g.bodyStarted {
		g.bodyStarted = true
		ct := g.Header().Get("Content-Type")
		g.compressible = g.status < 300 && compressible(ct)
		if g.compressible {
			g.rw.Header().Set("Content-Encoding", "gzip")
			g.rw.Header().Del("Content-Length")
			g.w = gzip.NewWriter(g.rw)
		} else {
			g.w = g.rw
		}
		if g.headerSent {
			g.rw.WriteHeader(g.status)
		}
	}
	return g.w.Write(b)
}

// finish flushes the gzip trailer and forwards a pending WriteHeader (e.g. for
// HEAD requests / empty bodies that never reached Write).
func (g *gzipResponseWriter) finish() {
	if gw, ok := g.w.(*gzip.Writer); ok {
		gw.Close()
	}
	if g.headerSent && !g.bodyStarted {
		g.rw.WriteHeader(g.status)
	}
}

func compressible(ct string) bool {
	return strings.HasPrefix(ct, "text/") ||
		strings.Contains(ct, "json") ||
		strings.Contains(ct, "javascript") ||
		strings.Contains(ct, "xml") ||
		strings.Contains(ct, "svg")
}

// gzipCompress is a middleware that gzip-compresses compressible responses when
// the client advertises gzip support. Images/binaries pass through untouched.
func gzipCompress(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			next.ServeHTTP(w, r)
			return
		}
		gw := &gzipResponseWriter{rw: w, w: w}
		defer gw.finish()
		next.ServeHTTP(gw, r)
	})
}

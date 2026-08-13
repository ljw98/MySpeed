package main

import (
	"net"
	"net/http"
	"strings"
)

// clientIP extracts the caller's IP from request headers, falling back to
// RemoteAddr. Honours the standard proxy headers in priority order.
// IPv4-mapped IPv6 prefixes are stripped.
func clientIP(r *http.Request) string {
	// X-Forwarded-For: first entry is the originating client
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if idx := strings.IndexByte(xff, ','); idx >= 0 {
			return stripMapped(strings.TrimSpace(xff[:idx]))
		}
		return stripMapped(strings.TrimSpace(xff))
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return stripMapped(strings.TrimSpace(xri))
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return stripMapped(r.RemoteAddr)
	}
	return stripMapped(host)
}

// stripMapped removes the ::ffff: prefix that Go's net layer adds to IPv4
// addresses received on a dual-stack socket.
func stripMapped(ip string) string {
	return strings.TrimPrefix(ip, "::ffff:")
}

// privateOrLocal reports whether ip is a loopback / private / link-local
// address. Returns a human-readable label or "" for public addresses.
// Implemented via net.IP.IsLoopback/IsPrivate etc. (typed checks, no string
// prefix matching).
func privateOrLocal(ipStr string) string {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return ""
	}
	switch {
	case ip.IsLoopback():
		if strings.Contains(ipStr, ":") {
			return "localhost IPv6 access"
		}
		return "localhost IPv4 access"
	case ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast():
		if strings.Contains(ipStr, ":") {
			return "link-local IPv6 access"
		}
		return "link-local IPv4 access"
	case ip.IsPrivate():
		return "private IPv4 access"
	}
	return ""
}

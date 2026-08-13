package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ipInfoResponse is the JSON we return to the client: structured and
// machine-readable, with no pre-formatted display string.
type ipInfoResponse struct {
	IP       string            `json:"ip"`
	ISP      string            `json:"isp,omitempty"`
	Country  string            `json:"country,omitempty"`
	Distance string            `json:"distance,omitempty"`
	Raw      map[string]string `json:"raw,omitempty"`
}

// serverLocation is cached in memory at process start, protected by a
// sync.RWMutex.
var (
	serverLocMu  sync.RWMutex
	serverLoc    string
	serverLocSet bool
	ipinfoClient = &http.Client{Timeout: 3 * time.Second}
)

func handleIPInfo(w http.ResponseWriter, r *http.Request) {
	if handleCORS(w, r) {
		return
	}
	cfg := configFromContext(r)
	ip := clientIP(r)

	resp := ipInfoResponse{IP: ip}

	label := privateOrLocal(ip)
	if label != "" {
		resp.ISP = label
		writeJSON(w, r, resp)
		return
	}

	// Private/local IP: no upstream lookup needed.
	if cfg.DisableIPInfo || !r.URL.Query().Has("isp") {
		writeJSON(w, r, resp)
		return
	}

	raw := fetchIPInfo(r.Context(), cfg, ip)
	if raw != nil {
		resp.Raw = raw
		if org, ok := raw["org"]; ok && org != "" {
			resp.ISP = stripASPrefix(org)
		}
		resp.Country = raw["country"]
		if unit := r.URL.Query().Get("distance"); (unit == "km" || unit == "mi") && raw["loc"] != "" {
			if d := computeDistance(r.Context(), cfg, raw["loc"], unit); d != "" {
				resp.Distance = d
			}
		}
	}
	if resp.ISP == "" {
		resp.ISP = "Unknown ISP"
	}
	writeJSON(w, r, resp)
}

func writeJSON(w http.ResponseWriter, r *http.Request, resp ipInfoResponse) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_ = handleCORS(w, r) // headers only; OPTIONS already handled at entry
	_ = json.NewEncoder(w).Encode(resp)
}

// fetchIPInfo queries ipinfo.io for the given IP, with a context-derived
// timeout.
func fetchIPInfo(ctx context.Context, cfg Config, ip string) map[string]string {
	token := ""
	if cfg.IPInfoToken != "" {
		token = "?token=" + cfg.IPInfoToken
	}
	reqURL := "https://ipinfo.io/" + ip + "/json" + token
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil
	}
	resp, err := ipinfoClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	var m map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&m); err != nil {
		return nil
	}
	return m
}

// computeDistance looks up (and caches) the server's geolocation, then
// applies the Haversine formula between server and client coordinates.
func computeDistance(ctx context.Context, cfg Config, clientLoc, unit string) string {
	sLoc, ok := serverLocation(cfg)
	if !ok {
		return ""
	}
	lat1, lon1, cOK := parseLatLon(clientLoc)
	lat2, lon2, sOK := parseLatLon(sLoc)
	if !cOK || !sOK {
		return ""
	}
	km := haversine(lat1, lon1, lat2, lon2)
	return formatDistance(km, unit)
}

// serverLocation returns the cached server geolocation, fetching it once
// from ipinfo.io/json on first call and holding it in memory under a mutex.
func serverLocation(cfg Config) (string, bool) {
	serverLocMu.RLock()
	if serverLocSet {
		v := serverLoc
		serverLocMu.RUnlock()
		return v, v != ""
	}
	serverLocMu.RUnlock()

	serverLocMu.Lock()
	defer serverLocMu.Unlock()
	if serverLocSet {
		return serverLoc, serverLoc != ""
	}
	serverLocSet = true

	token := ""
	if cfg.IPInfoToken != "" {
		token = "?token=" + cfg.IPInfoToken
	}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://ipinfo.io/json"+token, nil)
	if err != nil {
		return "", false
	}
	resp, err := ipinfoClient.Do(req)
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()
	var m map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&m); err != nil {
		return "", false
	}
	if loc := m["loc"]; loc != "" {
		serverLoc = loc
		return loc, true
	}
	return "", false
}

// stripASPrefix removes the "AS##### " prefix that ipinfo prepends to the
// org field.
func stripASPrefix(org string) string {
	// AS followed by digits and whitespace
	if i := strings.Index(org, " "); i > 0 && strings.HasPrefix(org, "AS") {
		return strings.TrimSpace(org[i+1:])
	}
	return org
}

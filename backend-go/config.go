package main

import (
	"os"
	"strings"
)

// Config holds runtime configuration sourced from environment variables.
type Config struct {
	Title         string
	Port          string
	DisableIPInfo bool
	DistanceUnit  string // "km" or "mi"
	IPInfoToken   string
}

// Load reads configuration from the environment with sensible defaults.
func Load() Config {
	cfg := Config{
		Title:        envOr("TITLE", "MySpeed"),
		Port:         envOr("PORT", "8080"),
		DistanceUnit: envOr("DISTANCE_UNIT", "km"),
		IPInfoToken:  os.Getenv("IPINFO_TOKEN"),
	}
	cfg.DisableIPInfo = strings.EqualFold(os.Getenv("DISABLE_IPINFO"), "true")
	return cfg
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

package main

import (
	"math"
	"strconv"
	"strings"
)

// haversine computes the great-circle distance between two lat/lon pairs in
// kilometres using the standard Haversine formula.
func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const earthKm = 6371.0
	rad := math.Pi / 180.0
	lat1 *= rad
	lat2 *= rad
	dlat := (lat2 - lat1)
	dlon := (lon2 - lon1) * rad
	a := math.Sin(dlat/2)*math.Sin(dlat/2) +
		math.Cos(lat1)*math.Cos(lat2)*math.Sin(dlon/2)*math.Sin(dlon/2)
	c := 2 * math.Asin(math.Sqrt(a))
	return earthKm * c
}

// formatDistance renders a km distance with one decimal place. If unit is
// "mi" the value is converted from kilometres.
func formatDistance(km float64, unit string) string {
	if strings.ToLower(unit) == "mi" {
		mi := km / 1.609344
		return strconv.FormatFloat(math.Round(mi*10)/10, 'f', 1, 64) + " mi"
	}
	return strconv.FormatFloat(math.Round(km*10)/10, 'f', 1, 64) + " km"
}

// parseLatLon splits an ipinfo "lat,lon" string into two floats.
func parseLatLon(loc string) (lat, lon float64, ok bool) {
	parts := strings.SplitN(loc, ",", 2)
	if len(parts) != 2 {
		return 0, 0, false
	}
	var err1, err2 error
	lat, err1 = strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	lon, err2 = strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	return lat, lon, true
}

package scoring

import "math"

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func normalizeHigherLinear(v, floor, cap float64) float64 {
	if floor <= 0 || cap <= floor {
		return 0
	}
	return clamp01((v-floor)/(cap-floor)) * 100
}

func normalizeHigherLog(v, floor, cap float64) float64 {
	if v <= 0 || floor <= 0 || cap <= floor {
		return 0
	}
	return clamp01((math.Log(v)-math.Log(floor))/(math.Log(cap)-math.Log(floor))) * 100
}

func normalizeLowerLinear(v, best, worst float64) float64 {
	if worst <= best {
		return 0
	}
	return (1 - clamp01((v-best)/(worst-best))) * 100
}

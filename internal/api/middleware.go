package api

import (
	"log"
	"net"
	"net/http"
	"sync"
	"time"
)

type visitor struct {
	tokens   float64
	lastSeen time.Time
}

type RateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     float64 // tokens per second
	burst    float64 // max tokens
}

func newRateLimiter(requestsPerMinute int, burst int) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		rate:     float64(requestsPerMinute) / 60.0,
		burst:    float64(burst),
	}
	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, exists := rl.visitors[ip]
	now := time.Now()
	if !exists {
		rl.visitors[ip] = &visitor{tokens: rl.burst - 1, lastSeen: now}
		return true
	}

	elapsed := now.Sub(v.lastSeen).Seconds()
	v.lastSeen = now
	v.tokens += elapsed * rl.rate
	if v.tokens > rl.burst {
		v.tokens = rl.burst
	}

	if v.tokens < 1 {
		return false
	}
	v.tokens--
	return true
}

func (rl *RateLimiter) cleanup() {
	for {
		time.Sleep(5 * time.Minute)
		rl.mu.Lock()
		cutoff := time.Now().Add(-10 * time.Minute)
		for ip, v := range rl.visitors {
			if v.lastSeen.Before(cutoff) {
				delete(rl.visitors, ip)
			}
		}
		rl.mu.Unlock()
	}
}

var (
	getLimiter  = newRateLimiter(120, 30)  // 120 req/min, burst 30
	postLimiter = newRateLimiter(12, 5)    // 12 req/min, burst 5
)

func extractIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		// First IP in the chain is the client
		for i := 0; i < len(fwd); i++ {
			if fwd[i] == ',' {
				return fwd[:i]
			}
		}
		return fwd
	}
	if real := r.Header.Get("X-Real-Ip"); real != "" {
		return real
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

type statusCapture struct {
	http.ResponseWriter
	status int
}

func (sc *statusCapture) WriteHeader(code int) {
	sc.status = code
	sc.ResponseWriter.WriteHeader(code)
}

func SecurityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ip := extractIP(r)

		// Rate limiting
		var limiter *RateLimiter
		if r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodPatch {
			limiter = postLimiter
		} else {
			limiter = getLimiter
		}

		if !limiter.allow(ip) {
			w.Header().Set("Retry-After", "10")
			writeJSON(w, http.StatusTooManyRequests, apiError{Error: "rate limit exceeded"})
			log.Printf("[RATE] %s %s %s — 429", r.Method, r.URL.Path, ip)
			return
		}

		// Body size limit for POST/PUT/PATCH (1 MB)
		if r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodPatch {
			r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		}

		sc := &statusCapture{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sc, r)

		log.Printf("[API] %d %s %s %s %s",
			sc.status, r.Method, r.URL.Path, ip, time.Since(start).Round(time.Microsecond))
	})
}

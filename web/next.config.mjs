/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "m.media-amazon.com"
      },
      {
        protocol: "https",
        hostname: "images-na.ssl-images-amazon.com"
      },
      {
        protocol: "https",
        hostname: "**.amazonaws.com"
      }
    ]
  },
  async redirects() {
    return [
      {
        source: "/best-flashlights/for-law-enforcement",
        destination: "/best-flashlights/survival",
        permanent: true
      }
    ];
  },
  async rewrites() {
    const apiDest = process.env.API_BASE_URL || "http://localhost:8080";
    return [
      {
        source: "/api/:path*",
        destination: `${apiDest}/:path*`
      }
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "X-Frame-Options",
            value: "DENY"
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block"
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload"
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https://*.media-amazon.com https://*.ssl-images-amazon.com https://*.amazonaws.com",
              "connect-src 'self' https://flashlightratings.com https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://www.googletagmanager.com",
              "form-action 'self' https://www.amazon.com",
              "frame-ancestors 'none'",
              "base-uri 'self'"
            ].join("; ")
          }
        ]
      }
    ];
  }
};

export default nextConfig;

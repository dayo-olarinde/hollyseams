import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API requests to the backend during development
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:7000/api/:path*",
      },
    ];
  },
};

export default nextConfig;

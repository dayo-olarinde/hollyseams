import type { NextConfig } from "next";

/**
 * The API lives on the same origin from the browser's point of view.
 *
 * That matters beyond tidiness: the session cookie is `SameSite=Strict`, so a cross-origin
 * request (app on :3000, API on :7000) would simply not carry it. Proxying through this app
 * keeps every request first-party and means `withCredentials` has something to be credentialed
 * with. The origin is read from the environment so a deployed build points at the real API
 * instead of localhost, with the local default kept for development.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:7000";

const nextConfig: NextConfig = {
  /*
   * Dev and production builds cannot share one `.next` directory. `next dev` (Turbopack) and
   * `next build` (webpack) each claim the same folder, and a build executed while the other
   * mode's server is live interleaves its output with the running server's state — producing a
   * `.next` whose server files reference chunks that were never written (seen here as
   * `Cannot find module '../chunks/ssr/[turbopack]_runtime.js'` from a `next start`). Keeping
   * the phone's always-on server on `.next-prod` (see `build:prod` / `start:prod` scripts) and
   * dev on the default `.next` means the two can run side by side forever.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

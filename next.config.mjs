/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Every page here shows live data (connections, leads, recovery). Next 14
    // keeps a client-side copy of dynamic pages for 30s and replays it on
    // sidebar navigation, which showed stale state (e.g. "Clio: Not connected"
    // right after connecting). 0 = always fetch fresh when navigating.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;

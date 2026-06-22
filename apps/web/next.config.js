/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dashboard is a client-rendered SPA over the API; produce a standalone
  // server build so the container image stays small.
  output: 'standalone',
};

module.exports = nextConfig;

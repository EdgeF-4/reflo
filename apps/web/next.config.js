/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Use the stable compiler API. Next's CLI-spawn path can close before its
  // captured --showConfig output arrives on newer Node runtimes.
  experimental: { useTypeScriptCli: false },
  // The dashboard is a client-rendered SPA over the API; produce a standalone
  // server build so the container image stays small.
  output: 'standalone',
};

module.exports = nextConfig;

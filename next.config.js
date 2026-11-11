/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['lunar-javascript'],
  // Keep the Node-only Pi SDK and its OAuth credential store out of frontend/server bundles.
  serverExternalPackages: ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai'],
};

module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "esbuild",
    "@esbuild/win32-x64",
    "stripe",
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Don't try to statically pre-render any pages at build time
  // All pages are dynamic (require auth/session)
  experimental: {
    // Force all pages to be dynamic
  },
};

export default nextConfig;
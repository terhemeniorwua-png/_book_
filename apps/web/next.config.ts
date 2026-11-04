import path from 'node:path';
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  distDir: process.env.E2E_NEXT_DIST_DIR ?? '.next',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};
export default nextConfig;
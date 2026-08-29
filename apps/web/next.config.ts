import type { NextConfig } from 'next'
import { withSerwist } from '@serwist/turbopack'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@destravai/core', '@destravai/contracts'],
  images: {
    unoptimized: true,
  },
}

export default withSerwist(nextConfig)

import type { NextConfig } from 'next'
import { withSerwist } from '@serwist/turbopack'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@destravai/core'],
  images: {
    unoptimized: true,
  },
}

export default withSerwist(nextConfig)

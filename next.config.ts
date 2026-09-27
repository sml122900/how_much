import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.coupangcdn.com" },
      { protocol: "https", hostname: "ads-partners.coupang.com" },
    ],
  },
  // assets/sfx/*.mp3 를 import 하면 해시된 정적 URL이 된다
  webpack(config) {
    config.module.rules.push({
      test: /\.mp3$/i,
      type: "asset/resource",
      generator: { filename: "static/media/[name].[contenthash:8][ext]" },
    });
    return config;
  },
};

export default nextConfig;

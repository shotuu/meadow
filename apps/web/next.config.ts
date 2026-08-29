import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma's generated client does its own dynamic filesystem access to
  // locate query engine binaries; keep it external instead of letting
  // Turbopack trace/bundle the whole project through it.
  serverExternalPackages: ["@prisma/client", "@finance-app/db"],
};

export default nextConfig;

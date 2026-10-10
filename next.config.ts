import type { NextConfig } from "next";
const config: NextConfig = {
  agentRules: false,
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["typescript"],
};
export default config;

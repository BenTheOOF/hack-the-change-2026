import type { NextConfig } from "next";
import { resolve } from "node:path";

try {
  process.loadEnvFile(resolve(process.cwd(), "../.env"));
} catch {}

const config: NextConfig = {};

export default config;

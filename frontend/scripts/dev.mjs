import process from "node:process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const aiEnvFile = "../packages/ai/.env";
if (existsSync(aiEnvFile)) process.loadEnvFile(aiEnvFile);
const nextCli = new URL("../node_modules/next/dist/bin/next", import.meta.url);
process.argv = [process.execPath, fileURLToPath(nextCli), "dev"];
await import(nextCli.href);

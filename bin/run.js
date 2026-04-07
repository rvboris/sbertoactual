#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, "../dist/index.js");

const result = spawnSync("node", [scriptPath, ...process.argv.slice(2)], {
	stdio: "inherit",
	shell: true,
});

process.exit(result.status ?? 1);

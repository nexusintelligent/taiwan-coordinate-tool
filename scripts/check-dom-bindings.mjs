import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const ids = new Set([...source.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const requiredSelectors = new Set([...source.matchAll(/\$\("#([^"]+)"\)/g)].map((match) => match[1]));
const missing = [...requiredSelectors].filter((id) => !ids.has(id));
if (missing.length) {
  console.error(`Missing required DOM controls: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`DOM binding audit passed (${requiredSelectors.size} required controls).`);

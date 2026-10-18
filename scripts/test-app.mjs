import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
// Enumerate in JavaScript so Windows/Node 21 does not depend on shell glob expansion.
const root = fileURLToPath(new URL("../", import.meta.url));
const tests = readdirSync(new URL("../integration/", import.meta.url))
  .filter(name => name.endsWith(".test.mjs")).sort().map(name => `integration/${name}`);
if (!tests.length) throw Error("No app tests were found.");
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=2", ...tests], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);

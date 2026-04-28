import { spawnSync } from "node:child_process";
import { loadDotEnv, preparePrismaBuildEnvironment } from "./prisma-build-env.mjs";

loadDotEnv();

const { env, schemaPath } = preparePrismaBuildEnvironment(process.env);

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npxCommand, ["prisma", "generate", "--schema", schemaPath], {
  stdio: "inherit",
  cwd: process.cwd(),
  env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

import { spawn } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("Run this script with npm run dev.");
}

const workspaces = ["web", "api"];
const children = [];
let stopping = false;

function stopChildren(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;

  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const workspace of workspaces) {
  const child = spawn(process.execPath, [npmCli, "run", "dev", "--workspace", workspace], {
    stdio: "inherit",
  });

  children.push(child);
  child.on("error", (error) => {
    console.error(`Failed to start ${workspace}: ${error.message}`);
    process.exitCode = 1;
    stopChildren();
  });
  child.on("exit", (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stopChildren();
    }
  });
}

process.on("SIGINT", () => stopChildren("SIGINT"));
process.on("SIGTERM", () => stopChildren("SIGTERM"));
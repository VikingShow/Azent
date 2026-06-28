#!/usr/bin/env node
const { spawn } = require("child_process")
const { resolve } = require("path")

const script = resolve(__dirname, "..", "packages", "app", "src", "index.ts")
const child = spawn("bun", ["run", script, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
})

child.on("error", (err) => {
  console.error("Failed to start azent:", err.message)
  console.error("Make sure bun is installed: https://bun.sh")
  process.exit(1)
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(typeof code === "number" ? code : 0)
})

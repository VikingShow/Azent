#!/usr/bin/env node
const { spawn } = require('child_process')
const path = require('path')

const child = spawn(
  process.env.BUN ?? 'bun',
  [path.join(__dirname, '..', 'src', 'index.ts')],
  { stdio: 'inherit' },
)

child.on('exit', (code) => process.exit(code ?? 1))
child.on('error', () => {
  console.error('Azent requires Bun. Install: bun add -g @sowrjam/azent')
  process.exit(1)
})

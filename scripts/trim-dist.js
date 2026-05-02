const fs = require('node:fs')
const path = require('node:path')

const distFile = path.join(__dirname, '..', 'dist', 'index.js')
const content = fs.readFileSync(distFile, 'utf8')
const trimmed = content
  .split('\n')
  .map((line) => line.trimEnd())
  .join('\n')

fs.writeFileSync(distFile, trimmed, 'utf8')

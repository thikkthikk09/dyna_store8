/**
 * Copy standalone/ into public/standalone for Vite build (Vercel dist).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const src = path.join(root, 'standalone')
const dest = path.join(root, 'public', 'standalone')

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const name of fs.readdirSync(from)) {
    if (name === 'bakong.config.local.js' || name === '.bakong-runtime.json') continue
    const s = path.join(from, name)
    const d = path.join(to, name)
    if (fs.statSync(s).isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

fs.mkdirSync(path.join(root, 'public'), { recursive: true })
copyDir(src, dest)
console.log('Copied standalone → public/standalone')

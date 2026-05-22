import fs from 'fs'
import path from 'path'

/**
 * Load project root .env into process.env (does not override existing vars).
 */
export function loadDotenv(rootDir) {
  const file = path.join(rootDir, '.env')
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return false
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
  return true
}

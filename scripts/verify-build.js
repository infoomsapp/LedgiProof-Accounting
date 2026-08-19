#!/usr/bin/env node
// PATH: scripts/verify-build.js
// Run: node scripts/verify-build.js
// Verifies the build output is complete before packaging

const fs   = require('fs')
const path = require('path')

const REQUIRED = [
  'out/main/index.js',
  'out/preload/index.js',
  'out/renderer/index.html'
]

console.log('\n╔════════════════════════════════════════╗')
console.log('║   LedgiProof — Build Verification      ║')
console.log('╚════════════════════════════════════════╝\n')

let ok = true

for (const f of REQUIRED) {
  const full = path.join(process.cwd(), f)
  if (fs.existsSync(full)) {
    const size = fs.statSync(full).size
    console.log(`  ✅  ${f}  (${(size/1024).toFixed(1)} KB)`)
  } else {
    console.log(`  ❌  ${f}  MISSING`)
    ok = false
  }
}

// Check renderer has actual JS assets (not just empty HTML)
const assetsDir = path.join(process.cwd(), 'out/renderer/assets')
if (fs.existsSync(assetsDir)) {
  const assets = fs.readdirSync(assetsDir)
  const jsFiles = assets.filter(f => f.endsWith('.js'))
  const cssFiles = assets.filter(f => f.endsWith('.css'))
  console.log(`\n  📦  Renderer assets: ${jsFiles.length} JS, ${cssFiles.length} CSS`)
  if (jsFiles.length === 0) {
    console.log('  ❌  NO JS ASSETS — renderer bundle is empty!')
    console.log('      Make sure .env exists with VITE_SUPABASE_URL before running npm run build')
    ok = false
  }
} else {
  console.log('  ❌  out/renderer/assets/ missing — renderer did not build')
  ok = false
}

// Check .env
const envPath = path.join(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8')
  const hasUrl = env.includes('VITE_SUPABASE_URL=') && !env.includes('VITE_SUPABASE_URL=https://your-project')
  const hasKey = env.includes('VITE_SUPABASE_ANON_KEY=') && !env.includes('VITE_SUPABASE_ANON_KEY=your-anon')
  console.log(`\n  ${hasUrl ? '✅' : '⚠️ '} VITE_SUPABASE_URL    ${hasUrl ? 'set' : 'MISSING OR PLACEHOLDER'}`)
  console.log(`  ${hasKey ? '✅' : '⚠️ '} VITE_SUPABASE_ANON_KEY ${hasKey ? 'set' : 'MISSING OR PLACEHOLDER'}`)
} else {
  console.log('\n  ❌  .env file not found — create it from .env.example')
  ok = false
}

console.log(ok
  ? '\n  🚀  Build looks good — safe to run npm run release:win\n'
  : '\n  ⛔  Fix the errors above before packaging\n'
)
process.exit(ok ? 0 : 1)
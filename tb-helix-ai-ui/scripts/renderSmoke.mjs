import { createServer } from 'vite'
const server = await createServer({ configFile: './vite.config.js', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const mod = await server.ssrLoadModule('/scripts/renderSmoke.entry.jsx')
const results = mod.run()
let bad = 0
for (const r of results) {
  if (r.ok) console.log(`  ok    ${r.name}  (${r.bytes} bytes)`)
  else { bad++; console.log(`  FAIL  ${r.name}\n${r.error}\n`) }
}
await server.close()
console.log(bad ? `\n${bad} of ${results.length} failed` : `\nAll ${results.length} render targets ok`)
process.exit(bad ? 1 : 0)

import { createServer } from 'vite'

// Mock, always, whatever the developer's .env says. With VITE_DATA_SOURCE=api the governance
// module waits on a fetch that never resolves under SSR, so every one of its routes rendered
// the "Loading the catalogue…" screen and passed — five targets that had been exercising the
// store and none of the components for as long as anyone had api in their .env. A smoke run
// whose coverage depends on an untracked file is a smoke run that reports what it did not do.
const server = await createServer({
  configFile: './vite.config.js',
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  define: { 'import.meta.env.VITE_DATA_SOURCE': JSON.stringify('mock') },
})
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

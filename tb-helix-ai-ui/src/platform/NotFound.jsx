import { Link } from 'react-router-dom'
import { DEFAULT_PATH } from './moduleRegistry'

export default function NotFound() {
  return (
    <section className="helix-screen" style={{ padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--me-ink)' }}>Nothing here</h1>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--me-grey-70)' }}>
        That address doesn&rsquo;t match anything in this workbench. <Link to={DEFAULT_PATH}>Go back to cases</Link>.
      </p>
    </section>
  )
}

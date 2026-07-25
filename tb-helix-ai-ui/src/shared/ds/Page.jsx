// Standard page container. One of three width tiers so every section aligns:
//   list   → 1120 (checks/agents/dictionary/library lists & galleries)
//   detail → 1240 (agent detail, check detail)
//   narrow → 960  (reading columns / forms)
const MAX = { list: 1120, detail: 1240, narrow: 960 }

export default function Page({ width = 'list', children, style }) {
  return (
    <div style={{ maxWidth: MAX[width] || MAX.list, margin: '0 auto', padding: '0 32px 72px', ...style }}>
      {children}
    </div>
  )
}

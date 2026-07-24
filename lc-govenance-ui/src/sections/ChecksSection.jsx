import Icon from '../ds/Icon'
import Button from '../ds/Button'
import Page from '../ds/Page'
import Toolbar from '../ds/Toolbar'
import SearchBar from '../ds/SearchBar'
import ViewSwitch from '../ds/ViewSwitch'
import { listWrap, listHead } from '../ds/listStyles'
import Check from '../components/Check'
import CheckRow, { CHECKS_COLS } from '../components/CheckRow'

// Checks library — Cards (layer-1 inline edit) or List (rows → detail page).
export default function ChecksSection({ v }) {
  return (
    <Page width="list">
      <Toolbar
        left={<SearchBar value={v.search} onChange={v.setSearch} placeholder="Search checks by wording or field code…" />}
        right={
          <>
            <a href={`data:text/markdown;charset=utf-8,${v.exportHref}`} download="lc-checks.md" style={exportBtn}>
              <Icon name="download" size={16} />Export
            </a>
            <Button variant="secondary" size="md" onClick={v.openAdd}><Icon name="sparkles" size={16} />Import</Button>
            <Button variant="primary" size="md" onClick={v.newCheck}>New check</Button>
            <ViewSwitch isList={v.isChecksList} onList={v.setChecksList} onCards={v.setChecksCards} />
          </>
        }
      />

      {v.isChecksList ? (
        <div style={listWrap}>
          <div style={{ ...CHECKS_COLS, ...listHead }}>
            <span /><span>Check</span><span>ID</span><span>Severity</span><span>In agent</span><span />
          </div>
          {v.libChecks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {v.libChecks.map((check) => (
            <Check key={check.id} check={check} />
          ))}
        </div>
      )}
    </Page>
  )
}

const exportBtn = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 44, padding: '0 18px', border: '1px solid var(--me-blue)', borderRadius: 999, fontSize: 14, fontWeight: 600, color: 'var(--me-blue)' }

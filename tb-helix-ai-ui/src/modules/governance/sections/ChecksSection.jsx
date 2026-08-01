import Icon from '@shared/ds/Icon'
import Button from '@shared/ds/Button'
import Page from '@shared/ds/Page'
import Toolbar from '@shared/ds/Toolbar'
import SearchBar from '@shared/ds/SearchBar'
import ViewSwitch from '@shared/ds/ViewSwitch'
import Chip from '@shared/ds/Chip'
import Select from '@shared/ds/Select'
import SortHeader from '@shared/ds/SortHeader'
import Eyebrow from '@shared/ds/Eyebrow'
import { Menu, MenuItem } from '@shared/ds/Menu'
import { listWrap, listHead } from '@shared/ds/listStyles'
import Check from '../components/Check'
import CheckRow, { CHECKS_COLS } from '../components/CheckRow'
import PendingNotice from '../components/PendingNotice'

// Checks library — Cards (layer-1 inline edit) or List (rows → detail page).
//
// **Every card here is a Rule card**, as the service has it — one catalogue, keyed
// `rules:`, each entry carrying a `check_type`. What differs is the tier: a *comparison*
// rule compares a field on one document with a field on another, deterministically; a
// *agent* check holds requirements in plain language for an agent to read against the
// presentation. There is no second kind of card, and "Requirement" belongs to what
// the credit requires — see the plan screen.
export default function ChecksSection({ v }) {
  return (
    // Detail tier, not list: the cards view puts full rule cards on this page,
    // so it needs the same width they get anywhere else they appear.
    <Page width="detail">
      <Toolbar
        left={<SearchBar value={v.search} onChange={v.setSearch} placeholder="Search checks by wording, field or document…" />}
        right={
          <>
            <a href={`data:text/markdown;charset=utf-8,${v.exportHref}`} download="lc-checks.md" style={exportBtn}>
              <Icon name="download" size={16} />Export
            </a>
            <PendingNotice pending={v.pending} />
            <Button variant="secondary" size="md" onClick={v.openAdd} disabled={v.addBlocked}><Icon name="sparkles" size={16} />Import</Button>
            <NewCheckButton v={v} />
            <ViewSwitch isList={v.isChecksList} onList={v.setChecksList} onCards={v.setChecksCards} />
          </>
        }
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', margin: '0 0 14px' }}>
        {v.typeFilters.map((tf) => (
          <Chip
            key={tf.id}
            tone={tf.on ? 'blue' : 'plain'}
            onClick={tf.onPick}
            style={{ padding: '5px 13px', fontWeight: 600, background: tf.on ? 'var(--me-blue-20)' : '#fff', borderColor: tf.on ? 'var(--me-blue)' : 'var(--me-grey-20)' }}
          >
            {tf.label}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.72 }}>{tf.count}</span>
          </Chip>
        ))}
        {/* Grouping belongs to the cards view: rows sort by column, cards don't
            have columns, and a wall of them needs headings to be findable. */}
        {!v.isChecksList && (
          <span style={{ marginLeft: 'auto' }}>
            <Select size="sm" value={v.checkGroupBy} onChange={v.setCheckGroupBy} options={v.groupByOptions} style={{ height: 30, borderRadius: 999, padding: '0 10px' }} />
          </span>
        )}
      </div>

      {v.isChecksList ? (
        <div style={listWrap}>
          <div style={{ ...CHECKS_COLS, ...listHead }}>
            <span />
            <SortHeader label="ID" {...v.checkSortCol('id')} />
            <SortHeader label="Kind" {...v.checkSortCol('kind')} />
            <SortHeader label="Check" {...v.checkSortCol('title')} />
            <SortHeader label="Severity" {...v.checkSortCol('severity')} />
            <SortHeader label="In Agent" {...v.checkSortCol('agent')} />
            <span />
          </div>
          {v.libChecks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {v.checkGroups.map((g) => (
            <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!g.ungrouped && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, position: 'sticky', top: 'calc(var(--nav-h, 56px) + 60px)', zIndex: 2, background: 'var(--me-grey-08)', padding: '6px 0 4px' }}>
                  <Eyebrow>{g.name}</Eyebrow>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{g.count}</span>
                  <span style={{ flex: 1, height: 1, background: 'var(--me-grey-15)' }} />
                </div>
              )}
              {g.checks.map((check) => <Check key={check.id} check={check} />)}
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}

// Which kind of card you are making is the first decision, so it is the button
// itself rather than a setting to find afterwards.
function NewCheckButton({ v }) {
  return (
    <Menu
      open={v.newMenuOpen}
      onClose={v.closeNewMenu}
      align="right"
      top={50}
      width={340}
      trigger={
        <Button
          variant="primary"
          size="md"
          onClick={v.addBlocked ? v.pending.onGo : v.toggleNewMenu}
          disabled={v.addBlocked}
          style={v.addBlocked ? { pointerEvents: 'auto', cursor: 'not-allowed' } : undefined}
        >
          New check<Icon name="chevron-down" size={16} />
        </Button>
      }
    >
      {v.newTypes.map((nt) => (
        <MenuItem key={nt.id} icon={nt.icon} label={nt.label} hint={nt.desc} onClick={nt.onPick} />
      ))}
    </Menu>
  )
}

const exportBtn = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 44, padding: '0 18px', border: '1px solid var(--me-blue)', borderRadius: 999, fontSize: 14, fontWeight: 600, color: 'var(--me-blue)' }

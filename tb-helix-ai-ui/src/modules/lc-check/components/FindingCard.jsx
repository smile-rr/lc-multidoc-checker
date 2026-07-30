import Icon from '@shared/ds/Icon'
import { ellipsis } from '@shared/ds/text'
import DispositionChips from './DispositionChips'
import { severityMeta, dispositionLabel } from '../state/severity'

// One finding in the review list. Severity leads, then where it came from, then
// the officer's call if they have made one — so a scan down the list answers
// "what still needs me?" without opening anything.
export default function FindingCard({ finding, kind, subtitle, selected, decision, onSelect, onDecide }) {
  const sev = severityMeta(finding.severity)
  return (
    <div
      onClick={onSelect}
      style={{
        background: '#fff',
        border: `1px solid ${selected ? 'var(--me-blue)' : sev.border}`,
        borderRadius: 10,
        padding: '10px 12px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        boxShadow: selected ? '0 4px 16px rgba(4,115,234,.14)' : '0 1px 3px rgba(27,28,30,.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: 'var(--me-ink)', textWrap: 'pretty', flex: 1, minWidth: 0 }}>{finding.title}</span>
        {/* The check that produced it — the reference an officer quotes. */}
        {finding.checkId ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            {/* How it was settled. An officer's confidence in a finding should
                differ by this, and so should the time they give it. */}
            {kind ? (
              <span title={kind === 'rule' ? 'Computed by a rule — arithmetic on extracted fields' : 'Read by an agent — a view formed against the presentation'} style={{ display: 'flex', color: kind === 'rule' ? 'var(--me-blue-deep)' : '#1F7A00' }}>
                <Icon name={kind === 'rule' ? 'equal' : 'list-checks'} size={11} color="currentColor" />
              </span>
            ) : null}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--me-grey-70)' }}>{finding.checkId}</span>
          </span>
        ) : (
          <span title={finding.raisedByOfficer ? 'You raised this — no check produced it' : 'No card in the dictionary covers this. It is a gap in the catalogue, not a kind of finding.'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: finding.raisedByOfficer ? 'var(--me-grey-70)' : '#946400', whiteSpace: 'nowrap' }}>
            <Icon name={finding.raisedByOfficer ? 'flag' : 'circle-alert'} size={11} color="currentColor" />
            {finding.raisedByOfficer ? 'yours' : 'no card'}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: sev.dot, flex: '0 0 7px' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: sev.text, whiteSpace: 'nowrap' }}>{sev.label}</span>
        <span style={{ fontSize: 12, color: 'var(--me-grey-70)', flex: 1, minWidth: 0, ...ellipsis }}>
          {subtitle}
        </span>
        {decision ? (
          <span style={{ fontSize: 12, fontWeight: 600, color: severityMeta(decision === 'agreed' ? 'clean' : decision === 'parked' ? 'possible' : 'discrepancy').text, whiteSpace: 'nowrap' }}>
            {dispositionLabel(decision)}
          </span>
        ) : null}
        <DispositionChips value={decision} onPick={onDecide} />
      </div>
    </div>
  )
}

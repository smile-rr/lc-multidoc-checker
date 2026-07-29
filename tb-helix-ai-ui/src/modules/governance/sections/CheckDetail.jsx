import Page from '@shared/ds/Page'
import DetailBack from '@shared/ds/DetailBack'
import Check from '../components/Check'

// Check detail — just the single check card, with a back-to-list link on top.
//
// Same width tier as the agent detail, because it is the same card: a rule row
// is a full sentence laid out left to right, and giving it a narrower page here
// than inside an agent would wrap the tail of the row for no reason.
export default function CheckDetail({ v }) {
  const d = v.checkDetail
  if (!d) return null
  return (
    <Page width="detail">
      <DetailBack label={d.backLabel} onBack={d.onBack} />
      <Check check={d.check} />
    </Page>
  )
}

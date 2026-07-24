import Page from '../ds/Page'
import DetailBack from '../ds/DetailBack'
import Check from '../components/Check'

// Check detail — just the single check card, with a back-to-list link on top.
export default function CheckDetail({ v }) {
  const d = v.checkDetail
  if (!d) return null
  return (
    <Page width="narrow">
      <DetailBack label={d.backLabel} onBack={d.onBack} />
      <Check check={d.check} />
    </Page>
  )
}

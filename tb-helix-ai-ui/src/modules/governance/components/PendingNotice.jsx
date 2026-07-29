import Icon from '@shared/ds/Icon'

// "Finish the one you started."
//
// Sits next to whichever "New …" button it is blocking. A disabled button with
// no reason beside it is the worst version of this: the person clicks, nothing
// happens, and they have no idea why or what to do. So the reason names the item
// and is itself the way back to it.
export default function PendingNotice({ pending }) {
  if (!pending) return null
  return (
    <button
      onClick={pending.onGo}
      title="Go to it — then save it or discard it"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 30,
        padding: '0 12px',
        borderRadius: 999,
        border: '1px solid #E9C97A',
        background: '#FBEFCF',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 12,
        color: '#946400',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name="circle-alert" size={13} color="currentColor" />
      {pending.label} is unfinished
      <span style={{ fontWeight: 600, textDecoration: 'underline' }}>Go to it</span>
    </button>
  )
}

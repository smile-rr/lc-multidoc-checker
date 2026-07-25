import Icon from './Icon'

// Shared pill search input. `width` fixes the width; omit for fluid (max 420).
export default function SearchBar({ value, onChange, placeholder, width }) {
  return (
    <div style={{ position: 'relative', width: width || '100%', maxWidth: width ? undefined : 420 }}>
      <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
        <Icon name="search" size={18} color="var(--me-grey-70)" />
      </span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{ width: '100%', height: 42, border: '1px solid var(--me-grey-20)', borderRadius: 999, padding: '0 16px 0 40px', fontSize: 13.5, color: 'var(--me-ink)', outline: 'none', background: '#fff' }}
      />
    </div>
  )
}

import { icons } from 'lucide-react'

// Maps a kebab-case lucide name (as used in the design, e.g. "chevron-right",
// "grip-vertical", "trash-2") to the PascalCase lucide-react component.
function pascal(name) {
  return String(name)
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

export default function Icon({ name, size = 16, color = 'currentColor', ...rest }) {
  const Cmp = icons[pascal(name)]
  if (!Cmp) return null
  return <Cmp size={Number(size)} color={color} {...rest} />
}

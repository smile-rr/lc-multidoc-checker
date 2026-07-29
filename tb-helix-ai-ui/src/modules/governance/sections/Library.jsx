import { ellipsis } from '@shared/ds/text'
import Eyebrow from '@shared/ds/Eyebrow'
import Icon from '@shared/ds/Icon'
import Button from '@shared/ds/Button'
import Page from '@shared/ds/Page'
import TextArea from '@shared/ds/TextArea'
import IconButton from '@shared/ds/IconButton'
import { Menu, MenuItem } from '@shared/ds/Menu'
import { cardSurface } from '@shared/ds/Card'
import { Z } from '@shared/ds/z'

// Reference articles can hold a full UCP/ISBP clause; the cap keeps a single
// article from running unbounded while still fitting real reference text.
const ARTICLE_MAX = 3000

// Reference library — one page: a horizontal strip of all books (first open by
// default, horizontal-scroll on overflow) above the reader for the active book.
export default function Library({ v }) {
  return (
    <Page width="detail">
      {/* Books first — a sticky bar so they stay visible while reading. Add/Import
          are secondary, pinned to the right as compact icons. */}
      <div style={booksBar}>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', flex: 1, minWidth: 0, padding: '2px 2px 4px' }}>
        {v.bookStrip.map((bk) => (
          <div
            key={bk.id}
            onClick={bk.onSelect}
            style={{ position: 'relative', flexShrink: 0, width: 232, display: 'flex', gap: 12, background: bk.active ? 'var(--me-blue-20)' : '#fff', border: `1px solid ${bk.active ? 'var(--me-blue)' : 'var(--me-grey-15)'}`, borderRadius: 12, boxShadow: bk.active ? 'none' : 'var(--shadow-sm)', padding: 14, cursor: 'pointer' }}
          >
            <span style={{ width: 34, height: 46, borderRadius: '3px 5px 5px 3px', background: 'var(--surface-brand-gradient)', flexShrink: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 5, boxShadow: '0 3px 8px rgba(27,28,30,.22)' }}><Icon name="book" size={15} color="#fff" /></span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--me-ink)', ...ellipsis, paddingRight: 18 }}>{bk.title}</span>
              <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)', ...ellipsis, marginTop: 2 }}>{bk.subtitle}</span>
              <span style={{ fontSize: 11, color: bk.active ? 'var(--me-blue-deep)' : 'var(--me-grey-70)', marginTop: 6, fontWeight: 600 }}>{bk.count}</span>
            </span>
            <IconButton icon="trash-2" size="sm" tone="danger" title="Delete this book" onClick={(e) => { e.stopPropagation(); bk.onDelete() }} style={{ position: 'absolute', top: 8, right: 8 }} />
          </div>
        ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={v.addBook} title="Add book" style={bookAction}><Icon name="plus" size={18} /></button>
          <button onClick={v.openImport} title="Import from PDF" style={bookAction}><Icon name="upload" size={16} /></button>
        </div>
      </div>

      {/* Reader sub-bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--me-ink)' }}>{v.activeTitle}</div>
          <div style={{ fontSize: 12, color: 'var(--me-grey-70)' }}>{v.activeSubtitle}</div>
        </div>
        <Menu
          open={v.addMenuOpen}
          onClose={v.toggleAddMenu}
          align="right"
          top={42}
          width={186}
          trigger={<Button variant="primary" size="sm" onClick={v.toggleAddMenu}>+ Add</Button>}
        >
          <MenuItem icon="folder-plus" label="New section" onClick={v.addSection} />
          <MenuItem icon="file-plus" label="New article" onClick={v.addArticle} />
        </Menu>
      </div>

      {/* Reader: TOC + article column */}
      <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start' }}>
        <nav style={{ width: 240, flexShrink: 0, position: 'sticky', top: 'calc(var(--nav-h, 56px) + 112px)', maxHeight: 'calc(100vh - var(--nav-h, 56px) - 84px)', overflow: 'auto' }}>
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}><Icon name="search" size={15} color="var(--me-grey-70)" /></span>
            <input value={v.libSearch} onChange={v.setLibSearch} placeholder="Search this book…" style={{ width: '100%', height: 36, border: '1px solid var(--me-grey-20)', borderRadius: 8, padding: '0 12px 0 33px', fontSize: 12.5, color: 'var(--me-ink)', outline: 'none', background: '#fff' }} />
          </div>
          {v.readerSections.map((sec) => (
            <div key={sec.key} style={{ marginBottom: 6 }}>
              {sec.hasName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={sec.onToggle} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '5px 0', textAlign: 'left' }}>
                    <Icon name={sec.caret} size={14} color="var(--me-grey-50)" />
                    <Eyebrow color="var(--me-blue)" style={{ flex: 1 }}>{sec.name}</Eyebrow>
                    <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>{sec.count}</span>
                  </button>
                  <IconButton icon="plus" size="sm" title="Add an article to this section" onClick={sec.onAddArticle} />
                  <IconButton icon="trash-2" size="sm" tone="danger" title="Delete this section" onClick={sec.onDeleteSection} />
                </div>
              )}
              {sec.open && (
                <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--me-grey-15)', marginLeft: 6 }}>
                  {sec.arts.map((art) => (
                    <a key={art.aid} href={`#${art.anchorId}`} style={{ display: 'block', padding: '6px 0 6px 13px', marginLeft: -1, borderLeft: '2px solid transparent', lineHeight: 1.3, color: 'var(--me-grey)' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{art.code}</span>
                      <span style={{ display: 'block', fontSize: 12.5, marginTop: 1 }}>{art.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div style={{ ...cardSurface(16), flex: 1, minWidth: 0, maxWidth: 760, padding: '14px 36px 28px' }}>
          <div style={{ margin: '14px 0 6px', paddingBottom: 12, borderBottom: '2px solid var(--me-grey-20)' }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 }}>{v.activeTitle}</h2>
          </div>
          {v.readerSections.map((sec) => (
            <div key={sec.key}>
              {sec.hasName && <Eyebrow as="div" color="var(--me-blue)" style={{ margin: '24px 0 2px' }}>{sec.name}</Eyebrow>}
              {sec.arts.map((art) => (
                <div key={art.aid} id={art.anchorId} style={{ padding: '18px 0', borderBottom: '1px solid var(--me-grey-08)', scrollMarginTop: 'calc(var(--nav-h, 56px) + 112px)' }}>
                  {art.notEditing ? (
                    <div onClick={art.onEdit} style={{ cursor: 'text', borderRadius: 8, margin: '-6px -10px', padding: '6px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--me-blue-deep)' }}>{art.code}</span>
                        <h3 style={{ fontSize: 16.5, fontWeight: 700, margin: 0 }}>{art.title}</h3>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{art.usedByLabel}</span>
                        <IconButton icon="trash-2" size="sm" tone="danger" title="Delete this article" onClick={(e) => { e.stopPropagation(); art.onDelete() }} />
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--me-grey)', whiteSpace: 'pre-wrap' }}>{art.read}</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input value={art.code} onChange={art.onChangeCode} placeholder="Code" style={{ width: 150, flexShrink: 0, border: '1px solid var(--me-grey-20)', borderRadius: 8, padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--me-blue-deep)', outline: 'none' }} />
                        <input value={art.title} onChange={art.onChangeTitle} placeholder="Article title" style={{ flex: 1, minWidth: 0, border: '1px solid var(--me-grey-20)', borderRadius: 8, padding: '8px 10px', fontSize: 16.5, fontWeight: 700, color: 'var(--me-ink)', outline: 'none' }} />
                      </div>
                      <TextArea value={art.read} onChange={art.onChangeRead} placeholder="Reading text…" maxLength={ARTICLE_MAX} style={{ width: '100%', minHeight: 120, border: '1px solid var(--me-grey-20)', borderRadius: 8, padding: '10px 12px', fontSize: 14, lineHeight: 1.7, color: 'var(--me-grey)', outline: 'none', fontFamily: 'inherit' }} />
                      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                        <Button variant="primary" size="sm" onClick={art.onSave}>Save</Button>
                        <button onClick={art.onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--me-grey-70)', fontWeight: 600 }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
          {v.libEmpty && <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--me-grey-70)' }}>Nothing here yet. Add an article or import a PDF.</div>}
        </div>
      </div>
    </Page>
  )
}

const booksBar = { position: 'sticky', top: 'var(--nav-h, 56px)', zIndex: Z.toolbar, background: 'var(--me-grey-08)', display: 'flex', alignItems: 'stretch', gap: 12, paddingTop: 14, paddingBottom: 10 }
const bookAction = { width: 40, height: 40, alignSelf: 'center', borderRadius: 10, border: '1px solid var(--me-grey-20)', background: '#fff', cursor: 'pointer', color: 'var(--me-grey-70)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }

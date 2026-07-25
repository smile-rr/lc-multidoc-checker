import Icon from '@shared/ds/Icon'
import Button from '@shared/ds/Button'
import Page from '@shared/ds/Page'
import AutoTextarea from '@shared/ds/AutoTextarea'
import { Z } from '@shared/ds/z'

// Reference articles can hold a full UCP/ISBP clause; the cap keeps a single
// article from running unbounded while still fitting real reference text.
const ARTICLE_MAX = 3000

// Reference library — one page: a horizontal strip of all books (first open by
// default, horizontal-scroll on overflow) above the reader for the active book.
export default function Library({ v }) {
  return (
    <Page width="list">
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
              <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--me-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 18 }}>{bk.title}</span>
              <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{bk.subtitle}</span>
              <span style={{ fontSize: 11, color: bk.active ? 'var(--me-blue-deep)' : 'var(--me-grey-70)', marginTop: 6, fontWeight: 600 }}>{bk.count}</span>
            </span>
            <button onClick={(e) => { e.stopPropagation(); bk.onDelete() }} title="Delete book" style={cardTrash}><Icon name="trash-2" size={14} /></button>
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
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <Button variant="primary" size="sm" onClick={v.toggleAddMenu}>+ Add</Button>
          {v.addMenuOpen && (
            <div style={{ position: 'absolute', top: 42, right: 0, zIndex: Z.popover, width: 186, background: '#fff', border: '1px solid var(--me-grey-20)', borderRadius: 10, boxShadow: '0 12px 30px rgba(27,28,30,.16)', padding: 6 }}>
              <button onClick={v.addSection} style={menuItem}><Icon name="folder-plus" size={15} color="var(--me-grey-70)" />New section</button>
              <button onClick={v.addArticle} style={menuItem}><Icon name="file-plus" size={15} color="var(--me-grey-70)" />New article</button>
            </div>
          )}
        </span>
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
                    <span style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--me-blue)' }}>{sec.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--me-grey-70)' }}>{sec.count}</span>
                  </button>
                  <button onClick={sec.onAddArticle} title="Add article to this section" style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--me-grey-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1 }}>+</button>
                  <button onClick={sec.onDeleteSection} title="Delete section" style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--me-grey-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="trash-2" size={13} /></button>
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

        <div style={{ flex: 1, minWidth: 0, maxWidth: 760, background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 16, boxShadow: '0 2px 10px rgba(27,28,30,.05)', padding: '14px 36px 28px' }}>
          <div style={{ margin: '14px 0 6px', paddingBottom: 12, borderBottom: '2px solid var(--me-grey-20)' }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 }}>{v.activeTitle}</h2>
          </div>
          {v.readerSections.map((sec) => (
            <div key={sec.key}>
              {sec.hasName && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--me-blue)', margin: '24px 0 2px' }}>{sec.name}</div>}
              {sec.arts.map((art) => (
                <div key={art.aid} id={art.anchorId} style={{ padding: '18px 0', borderBottom: '1px solid var(--me-grey-08)', scrollMarginTop: 'calc(var(--nav-h, 56px) + 112px)' }}>
                  {art.notEditing ? (
                    <div onClick={art.onEdit} style={{ cursor: 'text', borderRadius: 8, margin: '-6px -10px', padding: '6px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--me-blue-deep)' }}>{art.code}</span>
                        <h3 style={{ fontSize: 16.5, fontWeight: 700, margin: 0 }}>{art.title}</h3>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{art.usedByLabel}</span>
                        <button onClick={(e) => { e.stopPropagation(); art.onDelete() }} title="Delete article" style={artTrash}><Icon name="trash-2" size={14} /></button>
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--me-grey)', whiteSpace: 'pre-wrap' }}>{art.read}</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input value={art.code} onChange={art.onChangeCode} placeholder="Code" style={{ width: 150, flexShrink: 0, border: '1px solid var(--me-grey-20)', borderRadius: 8, padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--me-blue-deep)', outline: 'none' }} />
                        <input value={art.title} onChange={art.onChangeTitle} placeholder="Article title" style={{ flex: 1, minWidth: 0, border: '1px solid var(--me-grey-20)', borderRadius: 8, padding: '8px 10px', fontSize: 16.5, fontWeight: 700, color: 'var(--me-ink)', outline: 'none' }} />
                      </div>
                      <AutoTextarea value={art.read} onChange={art.onChangeRead} placeholder="Reading text…" maxLength={ARTICLE_MAX} style={{ width: '100%', minHeight: 120, border: '1px solid var(--me-grey-20)', borderRadius: 8, padding: '10px 12px', fontSize: 14, lineHeight: 1.7, color: 'var(--me-grey)', outline: 'none', fontFamily: 'inherit' }} />
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

const menuItem ={ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'var(--me-ink)' }
const booksBar = { position: 'sticky', top: 'var(--nav-h, 56px)', zIndex: Z.toolbar, background: 'var(--me-grey-08)', display: 'flex', alignItems: 'stretch', gap: 12, paddingTop: 14, paddingBottom: 10 }
const bookAction = { width: 40, height: 40, alignSelf: 'center', borderRadius: 10, border: '1px solid var(--me-grey-20)', background: '#fff', cursor: 'pointer', color: 'var(--me-grey-70)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
const cardTrash = { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--me-grey-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const artTrash = { width: 26, height: 26, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--me-grey-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }

import { useState, useEffect, useRef, Fragment, type Dispatch, type SetStateAction } from 'react'
import './App.css'
import { XSD, RDF } from './types'
import type { ClassData, Predicate } from './types'
import {
  fetchClasses,
  fetchPredicates,
  fetchVariants,
  fetchNodeKind,
  fetchMinCount,
  fetchMaxCount,
  fetchDistinctObjects,
  fetchDistinctSubjects,
  fetchShIn,
  fetchTotalTriples,
} from './queries'
import { generateTurtle } from './turtle'

// ── Icon primitives ──────────────────────────────────

function IconLink({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  )
}

function IconCopy({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  )
}

function IconDownload({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}

function IconCode({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>
  )
}

function IconSpinner({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="spin">
      <path d="M12 2a10 10 0 0 1 10 10"/>
    </svg>
  )
}

function IconChevron({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

function IconTag({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  )
}

function IconX({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function IconHexagon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="12 22 12 12"/>
      <path d="m3.27 6.96 8.73 5.05 8.73-5.05"/>
    </svg>
  )
}

// ── Types ────────────────────────────────────────────

type Tab = 'output' | 'predicates'

interface CancelToken {
  cancelled: boolean
  cancelledClasses: Set<string>
}

// ── Per-class enrichment (module-level to avoid stale closures) ──

async function enrichPredicate(
  classUri: string,
  predUri: string,
  statusKey: string,
  valueKey: string,
  fn: () => Promise<unknown>,
  token: CancelToken,
  setClassData: Dispatch<SetStateAction<ClassData[]>>,
) {
  const gone = () => token.cancelled || token.cancelledClasses.has(classUri)
  if (gone()) return
  setClassData(prev => prev.map(d => d.uri === classUri ? {
    ...d, predicates: d.predicates.map(p => p.uri === predUri ? { ...p, [statusKey]: 'loading' } : p),
  } : d))
  try {
    const value = await fn()
    if (!gone()) setClassData(prev => prev.map(d => d.uri === classUri ? {
      ...d, predicates: d.predicates.map(p => p.uri === predUri ? { ...p, [valueKey]: value, [statusKey]: 'done' } : p),
    } : d))
  } catch {
    if (!gone()) setClassData(prev => prev.map(d => d.uri === classUri ? {
      ...d, predicates: d.predicates.map(p => p.uri === predUri ? { ...p, [statusKey]: 'error' } : p),
    } : d))
  }
}

async function enrichClass(
  classUri: string,
  token: CancelToken,
  endpoint: string,
  setClassData: Dispatch<SetStateAction<ClassData[]>>,
) {
  const gone = () => token.cancelled || token.cancelledClasses.has(classUri)

  const updateClass = (patch: Partial<ClassData>) => {
    if (gone()) return
    setClassData(prev => prev.map(d => d.uri === classUri ? { ...d, ...patch } : d))
  }

  // Distinct subjects
  try {
    const n = await fetchDistinctSubjects(endpoint, classUri)
    updateClass({ distinctSubjects: n })
  } catch { /* non-fatal */ }

  if (gone()) return

  // Predicates
  let predicates: Predicate[]
  try {
    predicates = await fetchPredicates(endpoint, classUri)
  } catch (err) {
    updateClass({ predicatesLoading: false, predicatesError: (err as Error).message })
    return
  }
  if (gone()) return
  updateClass({ predicates, predicatesLoading: false })

  // Enrich each predicate
  for (const p of predicates) {
    if (gone()) break
    const ep = (sk: string, vk: string, fn: () => Promise<unknown>) =>
      enrichPredicate(classUri, p.uri, sk, vk, fn, token, setClassData)

    await ep('variantsStatus',        'variants',        () => fetchVariants(endpoint, classUri, p.uri))
    await ep('nodeKindStatus',        'nodeKinds',       () => fetchNodeKind(endpoint, classUri, p.uri))
    await ep('minCountStatus',        'minCount',        () => fetchMinCount(endpoint, classUri, p.uri))
    await ep('maxCountStatus',        'maxCount',        () => fetchMaxCount(endpoint, classUri, p.uri))
    await ep('distinctObjectsStatus', 'distinctObjects', () => fetchDistinctObjects(endpoint, classUri, p.uri))
    // sh:in is not auto-fetched — user triggers it per predicate
  }
}

// ── Turtle syntax highlight ──────────────────────────

function TurtleLine({ line }: { line: string }) {
  if (line.trimStart().startsWith('#')) {
    return <div><span className="t-comment">{line}</span>{'\n'}</div>
  }
  if (line.startsWith('@prefix')) {
    const m = line.match(/^(@prefix\s+)(\S+:\s+)(<[^>]+>)(.*)/)
    if (m) return (
      <div>
        <span className="t-keyword">{m[1]}</span>
        <span className="t-prefix">{m[2]}</span>
        <span className="t-iri">{m[3]}</span>
        <span>{m[4]}</span>
        {'\n'}
      </div>
    )
  }
  const parts = line.split(/(<[^>]+>|"[^"]*"(?:\^\^[^\s,;.]+)?|xsd:\w+|sh:\w+|rdf:\w+|ex:\w+)/)
  return (
    <div>
      {parts.map((p, j) => {
        if (p.startsWith('<') && p.endsWith('>')) return <span key={j} className="t-iri">{p}</span>
        if (p.startsWith('"')) return <span key={j} className="t-string">{p}</span>
        if (/^xsd:\w+/.test(p)) return <span key={j} className="t-datatype">{p}</span>
        if (/^sh:\w+/.test(p)) return <span key={j} className="t-keyword">{p}</span>
        if (/^(rdf|ex):\w+/.test(p)) return <span key={j} className="t-prefix">{p}</span>
        return <span key={j}>{p}</span>
      })}
      {'\n'}
    </div>
  )
}

function TurtleView({ src }: { src: string }) {
  return (
    <pre className="code-block">
      {src.split('\n').map((line, i) => <TurtleLine key={i} line={line} />)}
    </pre>
  )
}

// ── ClassPicker ──────────────────────────────────────

interface ClassPickerProps {
  classes: string[]
  loading: boolean
  error: string | null
  selected: string[]
  onAdd: (uri: string) => void
  onRemove: (uri: string) => void
  onAddAll: () => void
}

function ClassPicker({ classes, loading, error, selected, onAdd, onRemove, onAddAll }: ClassPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedSet = new Set(selected)
  const filtered = classes
    .filter(c => !selectedSet.has(c))
    .filter(c => query.trim() === '' || c.toLowerCase().includes(query.toLowerCase()))

  function add(uri: string) {
    onAdd(uri)
    setQuery('')
    setOpen(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { if (filtered[highlighted]) add(filtered[highlighted]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { setHighlighted(0) }, [query])

  const unselectedCount = classes.length - selected.length
  const showDropdown = open && !loading && !error && filtered.length > 0

  return (
    <div className="class-picker">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="class-chips">
          {selected.map(uri => (
            <span key={uri} className="class-chip">
              <span className="class-chip-label" title={uri}>{uri.split(/[#/]/).pop()}</span>
              <button className="class-chip-remove" onClick={() => onRemove(uri)}><IconX size={9} /></button>
            </span>
          ))}
        </div>
      )}

      {/* Autocomplete input */}
      <div className="autocomplete" ref={containerRef}>
        <div className="autocomplete-input-wrap">
          <input
            className="field-input"
            type="text"
            placeholder={
              loading ? 'Loading classes…'
              : error ? 'Failed to load classes'
              : classes.length === 0 ? 'No endpoint set'
              : unselectedCount === 0 ? 'All classes selected'
              : `Add class (${unselectedCount} available)…`
            }
            value={query}
            disabled={loading || !!error || unselectedCount === 0}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKey}
          />
          <span className="autocomplete-adornment">
            {loading
              ? <IconSpinner size={13} />
              : <span className={`autocomplete-chevron ${open ? 'flipped' : ''}`}><IconChevron /></span>
            }
          </span>
        </div>
        {error && <div className="autocomplete-error">{error}</div>}
        {showDropdown && (
          <ul className="autocomplete-dropdown">
            {filtered.map((cls, i) => (
              <li
                key={cls}
                className={`autocomplete-option ${i === highlighted ? 'highlighted' : ''}`}
                onMouseDown={() => add(cls)}
                onMouseEnter={() => setHighlighted(i)}
              >
                {cls}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add all button */}
      {!loading && !error && unselectedCount > 0 && (
        <button className="add-all-btn" onClick={onAddAll}>
          Add all {classes.length} classes
        </button>
      )}
    </div>
  )
}

// ── Main App ─────────────────────────────────────────

export default function App() {
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem('endpoint') ?? '')
  const [targetClasses, setTargetClasses] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('targetClasses') ?? '[]') } catch { return [] }
  })
  const [activeTab, setActiveTab] = useState<Tab>(() => (localStorage.getItem('activeTab') as Tab) ?? 'output')

  const [classes, setClasses] = useState<string[]>([])
  const [classesLoading, setClassesLoading] = useState(false)
  const [classesError, setClassesError] = useState<string | null>(null)

  const [classData, setClassData] = useState<ClassData[]>([])
  const [totalTriples, setTotalTriples] = useState<number | null>(null)

  const [turtle, setTurtle] = useState<string | null>(null)

  // Enrichment session management
  const cancelRef = useRef<CancelToken>({ cancelled: false, cancelledClasses: new Set() })
  const prevEndpointRef = useRef('')
  const prevClassesRef = useRef<string[]>([])
  const classDataRef = useRef<ClassData[]>([])
  classDataRef.current = classData

  // sh:in enabled set — persisted to localStorage, keyed by "classUri::predUri"
  const shInEnabledRef = useRef<Set<string>>(
    new Set(JSON.parse(localStorage.getItem('shInEnabled') ?? '[]') as string[])
  )

  // Auto-fetch sh:in for predicates that were previously toggled on
  useEffect(() => {
    const enabled = shInEnabledRef.current
    if (enabled.size === 0) return
    const token = cancelRef.current
    for (const d of classData) {
      for (const p of d.predicates) {
        if (p.shInStatus === 'idle' && enabled.has(`${d.uri}::${p.uri}`)) {
          enrichPredicate(d.uri, p.uri, 'shInStatus', 'shIn',
            () => fetchShIn(endpoint, d.uri, p.uri),
            token, setClassData)
        }
      }
    }
  }, [classData, endpoint])

  // Auto-regenerate turtle whenever classData changes
  useEffect(() => {
    const ready = classData.filter(d => d.predicates.length > 0)
    if (ready.length === 0) { setTurtle(null); return }
    setTurtle(generateTurtle(endpoint, ready, totalTriples))
  }, [endpoint, classData, totalTriples])

  // Fetch classes and total triples when endpoint changes
  useEffect(() => {
    if (!endpoint) {
      setClasses([])
      setClassesError(null)
      setTotalTriples(null)
      return
    }
    let cancelled = false
    setClassesLoading(true)
    setClassesError(null)
    setTotalTriples(null)
    fetchClasses(endpoint)
      .then(list => { if (!cancelled) { setClasses(list); setClassesLoading(false) } })
      .catch(err => { if (!cancelled) { setClassesError(err.message); setClassesLoading(false) } })
    fetchTotalTriples(endpoint)
      .then(n => { if (!cancelled) setTotalTriples(n) })
      .catch(() => { /* non-fatal */ })
    return () => { cancelled = true }
  }, [endpoint])

  // Manage per-class enrichment when endpoint or targetClasses changes
  useEffect(() => {
    const endpointChanged = prevEndpointRef.current !== endpoint
    prevEndpointRef.current = endpoint ?? ''

    if (endpointChanged) {
      cancelRef.current.cancelled = true
      cancelRef.current = { cancelled: false, cancelledClasses: new Set() }
      setClassData([])
      prevClassesRef.current = []
      if (!endpoint) return
    }

    const token = cancelRef.current
    const prev = new Set(prevClassesRef.current)
    const curr = new Set(targetClasses)

    // Cancel and remove dropped classes
    const dropped = [...prev].filter(u => !curr.has(u))
    if (dropped.length > 0) {
      dropped.forEach(u => token.cancelledClasses.add(u))
      setClassData(d => d.filter(c => !dropped.includes(c.uri)))
    }

    // Start enrichment for newly added classes
    const added = targetClasses.filter(u => !prev.has(u))
    for (const classUri of added) {
      if (token.cancelled) break
      setClassData(prev => [...prev, {
        uri: classUri,
        distinctSubjects: null,
        predicatesLoading: true,
        predicatesError: null,
        predicates: [],
      }])
      enrichClass(classUri, token, endpoint, setClassData)
    }

    prevClassesRef.current = [...targetClasses]
  }, [endpoint, targetClasses])

  function handleEndpointChange(value: string) {
    setEndpoint(value)
    localStorage.setItem('endpoint', value)
    setTargetClasses([])
    localStorage.removeItem('targetClasses')
  }

  function handleAddClass(uri: string) {
    if (targetClasses.includes(uri)) return
    const next = [...targetClasses, uri]
    setTargetClasses(next)
    localStorage.setItem('targetClasses', JSON.stringify(next))
  }

  function handleRemoveClass(uri: string) {
    const next = targetClasses.filter(u => u !== uri)
    setTargetClasses(next)
    localStorage.setItem('targetClasses', JSON.stringify(next))
  }

  function handleAddAll() {
    const next = [...classes]
    setTargetClasses(next)
    localStorage.setItem('targetClasses', JSON.stringify(next))
  }

  function handleFetchShIn(classUri: string, predUri: string) {
    const key = `${classUri}::${predUri}`
    shInEnabledRef.current.add(key)
    localStorage.setItem('shInEnabled', JSON.stringify([...shInEnabledRef.current]))
    enrichPredicate(classUri, predUri, 'shInStatus', 'shIn',
      () => fetchShIn(endpoint, classUri, predUri),
      cancelRef.current, setClassData)
  }

  function handleClearShIn(classUri: string, predUri: string) {
    const key = `${classUri}::${predUri}`
    shInEnabledRef.current.delete(key)
    localStorage.setItem('shInEnabled', JSON.stringify([...shInEnabledRef.current]))
    setClassData(prev => prev.map(d => d.uri === classUri ? {
      ...d,
      predicates: d.predicates.map(p => p.uri === predUri ? { ...p, shInStatus: 'idle', shIn: undefined } : p),
    } : d))
  }

  function handleCopy() {
    if (turtle) navigator.clipboard.writeText(turtle)
  }

  function handleDownload() {
    if (!turtle) return
    const name = targetClasses.length === 1
      ? (targetClasses[0].split(/[#/]/).pop() ?? 'shapes')
      : 'shapes'
    const blob = new Blob([turtle], { type: 'text/turtle' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name}.ttl`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const totalPredicates = classData.reduce((s, d) => s + d.predicates.length, 0)
  const anyLoading = classData.some(d => d.predicatesLoading)

  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="header">
        <div className="header-logo">
          <IconHexagon />
          <div>
            <div className="header-title">Shapetrospection</div>
            <div className="header-subtitle">SPARQL → SHACL shape extractor</div>
          </div>
        </div>
        <div className="header-sep" />
        <span className="badge">Turtle output</span>
      </header>

      {/* ── Sidebar ── */}
      <aside className="sidebar">

        <div className="sidebar-section">
          <div className="section-label">SPARQL Endpoint</div>
          <div className="input-wrapper">
            <IconLink size={13} />
            <input
              className="endpoint-input"
              type="url"
              placeholder="https://…/sparql"
              value={endpoint}
              onChange={e => handleEndpointChange(e.target.value)}
            />
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-label">Classes</div>
          <ClassPicker
            classes={classes}
            loading={classesLoading}
            error={classesError}
            selected={targetClasses}
            onAdd={handleAddClass}
            onRemove={handleRemoveClass}
            onAddAll={handleAddAll}
          />
        </div>

      </aside>

      {/* ── Main ── */}
      <main className="main">

        <nav className="tabs-bar">
          <button className={`tab-btn ${activeTab === 'output' ? 'active' : ''}`} onClick={() => { setActiveTab('output'); localStorage.setItem('activeTab', 'output') }}>
            <IconCode size={13} />
            Turtle Output
          </button>
          <button className={`tab-btn ${activeTab === 'predicates' ? 'active' : ''}`} onClick={() => { setActiveTab('predicates'); localStorage.setItem('activeTab', 'predicates') }}>
            <IconTag size={13} />
            Predicates
            {totalPredicates > 0 && <span className="tab-count">{totalPredicates}</span>}
          </button>
        </nav>

        {/* Tab: Turtle output */}
        {activeTab === 'output' && (
          <div className="output-area">
            <div className="output-toolbar">
              <div className="output-toolbar-left">
                <div className={`status-dot ${turtle ? 'ready' : anyLoading ? 'loading' : ''}`} />
                <span className="output-info">
                  {turtle
                    ? `text/turtle · ${classData.length} node shapes · ${totalPredicates} property shapes`
                    : anyLoading ? 'Fetching…' : 'No output yet'}
                </span>
              </div>
              <button className="toolbar-btn" disabled={!turtle} onClick={handleCopy}><IconCopy />Copy</button>
              <button className="toolbar-btn" disabled={!turtle} onClick={handleDownload}><IconDownload />Download .ttl</button>
            </div>
            {turtle
              ? <div className="code-output"><TurtleView src={turtle} /></div>
              : (
                <div className="empty-state">
                  <IconHexagon size={48} />
                  <div className="empty-title">No shapes generated yet</div>
                  <div className="empty-desc">Select one or more classes to produce SHACL shapes in Turtle format.</div>
                </div>
              )
            }
          </div>
        )}

        {/* Tab: Predicates */}
        {activeTab === 'predicates' && (
          <div className="output-area">
            <div className="output-toolbar">
              <div className="output-toolbar-left">
                {anyLoading
                  ? <><IconSpinner size={13} /><span className="output-info">Fetching…</span></>
                  : <><div className={`status-dot ${totalPredicates > 0 ? 'ready' : ''}`} /><span className="output-info">{totalPredicates > 0 ? `${totalPredicates} predicates across ${classData.length} classes` : 'No classes selected'}</span></>
                }
              </div>
            </div>
            {classData.length === 0 && (
              <div className="empty-state">
                <IconTag size={48} />
                <div className="empty-title">No predicates yet</div>
                <div className="empty-desc">Select one or more classes to see their predicates.</div>
              </div>
            )}
            {classData.length > 0 && (
              <div className="predicates-list">
                <table className="predicates-table">
                  <thead>
                    <tr>
                      <th>Predicate URI</th>
                      <th>sh:nodeKind</th>
                      <th>sh:datatype</th>
                      <th className="num">sh:minCount</th>
                      <th className="num">sh:maxCount</th>
                      <th className="num">sh:in</th>
                      <th className="num">void:triples</th>
                      <th className="num">void:distinctObjects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classData.map(d => (
                      <Fragment key={d.uri}>
                        <tr className="class-header-row">
                          <td colSpan={8}>
                            <span className="class-row-uri">{d.uri}</span>
                            {d.predicatesLoading && <IconSpinner size={11} />}
                            {d.predicatesError && <span className="datatype-badge error">{d.predicatesError}</span>}
                            {d.distinctSubjects !== null && <span className="class-row-meta">· {d.distinctSubjects.toLocaleString()} subjects</span>}
                          </td>
                        </tr>
                        {d.predicates.map(p => (
                          <tr key={`${d.uri}:${p.uri}`}>
                            <td className="predicate-uri">{p.uri}</td>

                            <td>
                              <div className="predicate-datatypes">
                                {p.nodeKindStatus === 'loading' && <IconSpinner size={11} />}
                                {p.nodeKindStatus === 'done' && p.nodeKinds?.map(v => (
                                  <span key={v.nodeKind} className={`datatype-badge ${v.nodeKind === 'sh:IRI' ? 'iri' : 'literal'}`}
                                    title={`triples: ${v.triples}`}>
                                    {v.nodeKind}
                                  </span>
                                ))}
                                {p.nodeKindStatus === 'error' && <span className="datatype-badge error">error</span>}
                              </div>
                            </td>

                            <td>
                              <div className="predicate-datatypes">
                                {p.variantsStatus === 'loading' && <IconSpinner size={11} />}
                                {p.variantsStatus === 'done' && p.variants?.map(v => (
                                  <span key={v.datatype}
                                    className={`datatype-badge ${v.datatype === 'IRI' ? 'iri' : v.datatype === 'BlankNode' ? 'unknown' : 'literal'}`}
                                    title={`triples: ${v.triples}, distinct: ${v.distinctObjects}`}>
                                    {v.datatype === 'IRI' ? 'IRI' : v.datatype === 'BlankNode' ? 'BlankNode' : v.datatype.replace(XSD, 'xsd:').replace(RDF, 'rdf:')}
                                  </span>
                                ))}
                                {p.variantsStatus === 'error' && <span className="datatype-badge error">error</span>}
                              </div>
                            </td>

                            <td className="num">
                              {p.minCountStatus === 'loading' && <IconSpinner size={11} />}
                              {p.minCountStatus === 'done' && p.minCount}
                              {p.minCountStatus === 'error' && <span className="datatype-badge error">error</span>}
                            </td>

                            <td className="num">
                              {p.maxCountStatus === 'loading' && <IconSpinner size={11} />}
                              {p.maxCountStatus === 'done' && (p.maxCount || '—')}
                              {p.maxCountStatus === 'error' && <span className="datatype-badge error">error</span>}
                            </td>

                            <td className="num">
                              {p.shInStatus === 'idle' && (
                                <button className="shin-toggle off" onClick={() => handleFetchShIn(d.uri, p.uri)} title="Enable sh:in for this predicate" />
                              )}
                              {p.shInStatus === 'loading' && <IconSpinner size={11} />}
                              {p.shInStatus === 'done' && (
                                <span className="shin-value">
                                  <button className="shin-toggle on" onClick={() => handleClearShIn(d.uri, p.uri)} title="Disable sh:in for this predicate" />
                                  {p.shIn === null ? '—' : <span className="datatype-badge shin">({p.shIn.length})</span>}
                                </span>
                              )}
                              {p.shInStatus === 'error' && <span className="datatype-badge error">error</span>}
                            </td>

                            <td className="num">{p.count.toLocaleString()}</td>

                            <td className="num">
                              {p.distinctObjectsStatus === 'loading' && <IconSpinner size={11} />}
                              {p.distinctObjectsStatus === 'done' && (p.distinctObjects?.toLocaleString() ?? '—')}
                              {p.distinctObjectsStatus === 'error' && <span className="datatype-badge error">error</span>}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

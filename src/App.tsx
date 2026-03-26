import { useState, useEffect, useRef } from 'react'
import './App.css'

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

function IconTrash({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
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

// ── SPARQL helpers ───────────────────────────────────

const CLASSES_QUERY = `SELECT DISTINCT ?class WHERE { [] a ?class . } ORDER BY ?class`

async function sparqlQuery(endpoint: string, query: string): Promise<{ [k: string]: { value: string } }[]> {
  const url = new URL(endpoint)
  url.searchParams.set('query', query)
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/sparql-results+json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return json.results.bindings
}

async function fetchClasses(endpoint: string): Promise<string[]> {
  const rows = await sparqlQuery(endpoint, CLASSES_QUERY)
  return rows.map(b => b.class.value)
}

type FetchStatus = 'idle' | 'loading' | 'done' | 'error'

export interface Predicate {
  uri: string
  count: number
  datatypeStatus: FetchStatus
  datatype?: string       // winning xsd:* URI, or 'IRI' for object properties
  nodeKindStatus: FetchStatus
  nodeKind?: string       // sh:IRI | sh:Literal | sh:BlankNode
  minCountStatus: FetchStatus
  minCount?: number
  maxCountStatus: FetchStatus
  maxCount?: number
  distinctObjectsStatus: FetchStatus
  distinctObjects?: number
}

async function fetchPredicates(endpoint: string, classUri: string): Promise<Predicate[]> {
  const query = `SELECT DISTINCT ?predicate (COUNT(?s) AS ?count)
WHERE {
  ?s a <${classUri}> ;
     ?predicate ?o .
  FILTER(?predicate != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>)
}
GROUP BY ?predicate
ORDER BY DESC(?count)`
  const rows = await sparqlQuery(endpoint, query)
  return rows.map(b => ({
    uri: b.predicate.value,
    count: parseInt(b.count.value, 10),
    datatypeStatus: 'idle' as const,
    nodeKindStatus: 'idle' as const,
    minCountStatus: 'idle' as const,
    maxCountStatus: 'idle' as const,
    distinctObjectsStatus: 'idle' as const,
  }))
}

async function fetchDatatype(endpoint: string, classUri: string, predicateUri: string): Promise<string> {
  const query = `SELECT ?datatype (COUNT(?o) AS ?count)
WHERE {
  ?s a <${classUri}> ;
     <${predicateUri}> ?o .
  BIND(IF(isIRI(?o), <urn:shapetrospection:IRI>, DATATYPE(?o)) AS ?datatype)
  FILTER(BOUND(?datatype))
}
GROUP BY ?datatype
ORDER BY DESC(?count)
LIMIT 1`
  const rows = await sparqlQuery(endpoint, query)
  if (rows.length === 0) return 'unknown'
  const val = rows[0].datatype.value
  return val === 'urn:shapetrospection:IRI' ? 'IRI' : val
}

async function fetchNodeKind(endpoint: string, classUri: string, predicateUri: string): Promise<string> {
  const query = `SELECT ?nodeKind (COUNT(?o) AS ?count)
WHERE {
  ?s a <${classUri}> ;
     <${predicateUri}> ?o .
  BIND(IF(isIRI(?o), <http://www.w3.org/ns/shacl#IRI>,
       IF(isBlank(?o), <http://www.w3.org/ns/shacl#BlankNode>,
       <http://www.w3.org/ns/shacl#Literal>)) AS ?nodeKind)
}
GROUP BY ?nodeKind
ORDER BY DESC(?count)
LIMIT 1`
  const rows = await sparqlQuery(endpoint, query)
  if (rows.length === 0) return 'unknown'
  return rows[0].nodeKind.value.replace('http://www.w3.org/ns/shacl#', 'sh:')
}

async function fetchMinCount(endpoint: string, classUri: string, predicateUri: string): Promise<number> {
  const query = `SELECT (MIN(?cnt) AS ?minCount)
WHERE {
  { SELECT ?s (COUNT(?o) AS ?cnt) WHERE {
      ?s a <${classUri}> .
      OPTIONAL { ?s <${predicateUri}> ?o . }
    } GROUP BY ?s
  }
}`
  const rows = await sparqlQuery(endpoint, query)
  if (rows.length === 0 || !rows[0].minCount) return 0
  return parseInt(rows[0].minCount.value, 10)
}

async function fetchMaxCount(endpoint: string, classUri: string, predicateUri: string): Promise<number> {
  const query = `SELECT (MAX(?cnt) AS ?maxCount)
WHERE {
  { SELECT ?s (COUNT(?o) AS ?cnt) WHERE {
      ?s a <${classUri}> ;
         <${predicateUri}> ?o .
    } GROUP BY ?s
  }
}`
  const rows = await sparqlQuery(endpoint, query)
  if (rows.length === 0 || !rows[0].maxCount) return 0
  return parseInt(rows[0].maxCount.value, 10)
}

async function fetchDistinctObjects(endpoint: string, classUri: string, predicateUri: string): Promise<number> {
  const query = `SELECT (COUNT(DISTINCT ?o) AS ?distinctObjects)
WHERE {
  ?s a <${classUri}> ;
     <${predicateUri}> ?o .
}`
  const rows = await sparqlQuery(endpoint, query)
  if (rows.length === 0 || !rows[0].distinctObjects) return 0
  return parseInt(rows[0].distinctObjects.value, 10)
}

async function fetchDistinctSubjects(endpoint: string, classUri: string): Promise<number> {
  const query = `SELECT (COUNT(DISTINCT ?s) AS ?distinctSubjects)
WHERE {
  ?s a <${classUri}> .
}`
  const rows = await sparqlQuery(endpoint, query)
  if (rows.length === 0 || !rows[0].distinctSubjects) return 0
  return parseInt(rows[0].distinctSubjects.value, 10)
}

// ── ClassAutocomplete ────────────────────────────────

interface ClassAutocompleteProps {
  classes: string[]
  loading: boolean
  error: string | null
  value: string
  onChange: (v: string) => void
}

function ClassAutocomplete({ classes, loading, error, value, onChange }: ClassAutocompleteProps) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep query in sync when value is set externally (e.g. from localStorage)
  useEffect(() => { setQuery(value) }, [value])

  const filtered = query.trim() === ''
    ? classes
    : classes.filter(c => c.toLowerCase().includes(query.toLowerCase()))

  function select(cls: string) {
    setQuery(cls)
    onChange(cls)
    setOpen(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (filtered[highlighted]) select(filtered[highlighted])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Reset highlight when filter changes
  useEffect(() => { setHighlighted(0) }, [query])

  const showDropdown = open && !loading && !error && filtered.length > 0

  return (
    <div className="autocomplete" ref={containerRef}>
      <div className="autocomplete-input-wrap">
        <input
          ref={inputRef}
          className="field-input"
          type="text"
          placeholder={loading ? 'Loading classes…' : error ? 'Failed to load classes' : classes.length ? `Search ${classes.length} classes…` : 'No endpoint set'}
          value={query}
          disabled={loading || !!error || classes.length === 0}
          onChange={e => {
            setQuery(e.target.value)
            onChange('')   // clear selection until user picks
            setOpen(true)
          }}
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
              onMouseDown={() => select(cls)}
              onMouseEnter={() => setHighlighted(i)}
            >
              {cls}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Turtle generation ────────────────────────────────

const XSD  = 'http://www.w3.org/2001/XMLSchema#'
const SH   = 'http://www.w3.org/ns/shacl#'
const VOID = 'http://rdfs.org/ns/void#'

function generateTurtle(classUri: string, predicates: Predicate[], distinctSubjects: number | null): string {
  const lastSep = Math.max(classUri.lastIndexOf('#'), classUri.lastIndexOf('/'))
  const ns        = classUri.substring(0, lastSep + 1)
  const localName = classUri.substring(lastSep + 1)

  const nodeShapeUri = `${ns}${localName}Shape`

  const propShapes = predicates.map(p => {
    const predLocal = p.uri.split(/[#/]/).pop() ?? 'property'
    return { uri: `${ns}${localName}Shape-${predLocal}`, p }
  })

  const lines: string[] = []

  lines.push(`@prefix sh:   <${SH}> .`)
  lines.push(`@prefix xsd:  <${XSD}> .`)
  lines.push(`@prefix void: <${VOID}> .`)
  lines.push('')

  // Node shape
  lines.push(`<${nodeShapeUri}>`)
  lines.push(`    a sh:NodeShape ;`)
  const nodeAttrs: string[] = [`    sh:targetClass <${classUri}>`]
  if (distinctSubjects !== null) nodeAttrs.push(`    void:distinctSubjects ${distinctSubjects}`)
  if (propShapes.length > 0) nodeAttrs.push(`    void:properties ${propShapes.length}`)
  propShapes.forEach(({ uri }) => nodeAttrs.push(`    sh:property <${uri}>`))
  nodeAttrs.forEach((a, i) => lines.push(a + (i < nodeAttrs.length - 1 ? ' ;' : ' .')))

  // Property shapes
  for (const { uri, p } of propShapes) {
    lines.push('')
    lines.push(`<${uri}>`)
    lines.push(`    a sh:PropertyShape ;`)
    lines.push(`    sh:path <${p.uri}> ;`)

    const attrs: string[] = []

    if (p.nodeKindStatus === 'done' && p.nodeKind && p.nodeKind !== 'unknown')
      attrs.push(`    sh:nodeKind ${p.nodeKind}`)

    if (p.datatypeStatus === 'done' && p.datatype && p.datatype !== 'unknown' && p.datatype !== 'IRI') {
      const dt = p.datatype.startsWith(XSD)
        ? `xsd:${p.datatype.slice(XSD.length)}`
        : `<${p.datatype}>`
      attrs.push(`    sh:datatype ${dt}`)
    }

    if (p.minCountStatus === 'done' && p.minCount !== undefined && p.minCount > 0)
      attrs.push(`    sh:minCount ${p.minCount}`)

    if (p.maxCountStatus === 'done' && p.maxCount !== undefined && p.maxCount > 0)
      attrs.push(`    sh:maxCount ${p.maxCount}`)

    attrs.push(`    void:triples ${p.count}`)

    if (p.distinctObjectsStatus === 'done' && p.distinctObjects !== undefined && p.distinctObjects > 0)
      attrs.push(`    void:distinctObjects ${p.distinctObjects}`)

    if (attrs.length > 0) {
      attrs.forEach((a, i) => lines.push(a + (i < attrs.length - 1 ? ' ;' : ' .')))
    } else {
      // sh:path line becomes the last — swap ; for .
      lines[lines.length - 1] = lines[lines.length - 1].replace(/ ;$/, ' .')
    }
  }

  return lines.join('\n')
}

// ── Turtle output with syntax highlight ──────────────

function TurtleView({ src }: { src: string }) {
  const lines = src.split('\n')
  return (
    <pre className="code-block">
      {lines.map((line, i) => <TurtleLine key={i} line={line} />)}
    </pre>
  )
}

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

// ── Main App ─────────────────────────────────────────

export default function App() {
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem('endpoint') ?? '')
  const [targetClass, setTargetClass] = useState(() => localStorage.getItem('targetClass') ?? '')
  const [activeTab, setActiveTab] = useState<Tab>(() => (localStorage.getItem('activeTab') as Tab) ?? 'output')

  const [classes, setClasses] = useState<string[]>([])
  const [classesLoading, setClassesLoading] = useState(false)
  const [classesError, setClassesError] = useState<string | null>(null)

  const [predicates, setPredicates] = useState<Predicate[]>([])
  const [predicatesLoading, setPredicatesLoading] = useState(false)
  const [predicatesError, setPredicatesError] = useState<string | null>(null)

  const [distinctSubjects, setDistinctSubjects] = useState<number | null>(null)

  const [turtle, setTurtle] = useState<string | null>(null)

  // Auto-regenerate turtle whenever predicates are updated
  useEffect(() => {
    if (!targetClass || predicates.length === 0) { setTurtle(null); return }
    setTurtle(generateTurtle(targetClass, predicates, distinctSubjects))
  }, [targetClass, predicates, distinctSubjects])

  // Fetch classes whenever endpoint changes
  useEffect(() => {
    if (!endpoint) { setClasses([]); setClassesError(null); return }
    let cancelled = false
    setClassesLoading(true)
    setClassesError(null)
    fetchClasses(endpoint)
      .then(list => { if (!cancelled) { setClasses(list); setClassesLoading(false) } })
      .catch(err => { if (!cancelled) { setClassesError(err.message); setClassesLoading(false) } })
    return () => { cancelled = true }
  }, [endpoint])

  // Fetch predicates, then datatype for each predicate — one query at a time
  useEffect(() => {
    if (!endpoint || !targetClass) {
      setPredicates([])
      setPredicatesError(null)
      setDistinctSubjects(null)
      return
    }
    let cancelled = false

    async function run() {
      setPredicatesLoading(true)
      setPredicatesError(null)
      setDistinctSubjects(null)

      // Fire distinct-subjects query first (single cheap query about the class)
      try {
        const n = await fetchDistinctSubjects(endpoint, targetClass)
        if (!cancelled) setDistinctSubjects(n)
      } catch { /* non-fatal — leave null */ }

      if (cancelled) return

      let list: Predicate[]
      try {
        list = await fetchPredicates(endpoint, targetClass)
      } catch (err) {
        if (!cancelled) { setPredicatesError((err as Error).message); setPredicatesLoading(false) }
        return
      }
      if (cancelled) return
      setPredicates(list)
      setPredicatesLoading(false)

      // Enrich each predicate one at a time, one property at a time
      for (const p of list) {
        if (cancelled) break

        const run = async <K extends keyof Predicate>(
          statusKey: K & `${string}Status`,
          valueKey: keyof Predicate,
          fn: () => Promise<Predicate[typeof valueKey]>,
        ) => {
          if (cancelled) return
          setPredicates(prev => prev.map(x => x.uri === p.uri ? { ...x, [statusKey]: 'loading' } : x))
          try {
            const value = await fn()
            if (!cancelled)
              setPredicates(prev => prev.map(x => x.uri === p.uri ? { ...x, [valueKey]: value, [statusKey]: 'done' } : x))
          } catch {
            if (!cancelled)
              setPredicates(prev => prev.map(x => x.uri === p.uri ? { ...x, [statusKey]: 'error' } : x))
          }
        }

        await run('datatypeStatus',         'datatype',         () => fetchDatatype(endpoint, targetClass, p.uri))
        await run('nodeKindStatus',         'nodeKind',         () => fetchNodeKind(endpoint, targetClass, p.uri))
        await run('minCountStatus',         'minCount',         () => fetchMinCount(endpoint, targetClass, p.uri))
        await run('maxCountStatus',         'maxCount',         () => fetchMaxCount(endpoint, targetClass, p.uri))
        await run('distinctObjectsStatus',  'distinctObjects',  () => fetchDistinctObjects(endpoint, targetClass, p.uri))
      }
    }

    run()
    return () => { cancelled = true }
  }, [endpoint, targetClass])

  function handleEndpointChange(value: string) {
    setEndpoint(value)
    localStorage.setItem('endpoint', value)
    // clear stale class selection when endpoint changes
    setTargetClass('')
    localStorage.removeItem('targetClass')
  }

  function handleClassChange(value: string) {
    setTargetClass(value)
    localStorage.setItem('targetClass', value)
  }

  function handleCopy() {
    if (turtle) navigator.clipboard.writeText(turtle)
  }

  function handleDownload() {
    if (!turtle) return
    const localName = targetClass.split(/[#/]/).pop() ?? 'shapes'
    const blob = new Blob([turtle], { type: 'text/turtle' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${localName}.ttl`
    a.click()
    URL.revokeObjectURL(a.href)
  }

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

        {/* Endpoint */}
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

        {/* Class autocomplete */}
        <div className="sidebar-section">
          <div className="section-label">Class</div>
          <ClassAutocomplete
            classes={classes}
            loading={classesLoading}
            error={classesError}
            value={targetClass}
            onChange={handleClassChange}
          />
        </div>

      </aside>

      {/* ── Main ── */}
      <main className="main">

        {/* Tabs */}
        <nav className="tabs-bar">
          <button className={`tab-btn ${activeTab === 'output' ? 'active' : ''}`} onClick={() => { setActiveTab('output'); localStorage.setItem('activeTab', 'output') }}>
            <IconCode size={13} />
            Turtle Output
          </button>
          <button className={`tab-btn ${activeTab === 'predicates' ? 'active' : ''}`} onClick={() => { setActiveTab('predicates'); localStorage.setItem('activeTab', 'predicates') }}>
            <IconTag size={13} />
            Predicates
            {predicates.length > 0 && <span className="tab-count">{predicates.length}</span>}
          </button>
        </nav>

        {/* Tab: Turtle output */}
        {activeTab === 'output' && (
          <div className="output-area">
            <div className="output-toolbar">
              <div className="output-toolbar-left">
                <div className={`status-dot ${turtle ? 'ready' : ''}`} />
                <span className="output-info">
                  {turtle ? `text/turtle · 1 node shape · ${predicates.length} property shapes` : 'No output yet'}
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
                  <div className="empty-desc">Select a class and click <strong>Generate Shapes</strong> to produce SHACL shapes in Turtle format.</div>
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
                {predicatesLoading
                  ? <><IconSpinner size={13} /><span className="output-info">Fetching predicates…</span></>
                  : predicatesError
                    ? <span className="output-info" style={{ color: 'var(--danger)' }}>{predicatesError}</span>
                    : <><div className={`status-dot ${predicates.length > 0 ? 'ready' : ''}`} /><span className="output-info">{predicates.length > 0 ? `${predicates.length} predicates` : 'No class selected'}</span></>
                }
              </div>
            </div>
            {!predicatesLoading && !predicatesError && predicates.length === 0 && (
              <div className="empty-state">
                <IconTag size={48} />
                <div className="empty-title">No predicates yet</div>
                <div className="empty-desc">Select a class to see all predicates used by its instances.</div>
              </div>
            )}
            {!predicatesLoading && predicates.length > 0 && (
              <div className="predicates-list">
                <div className="predicates-header-row">
                  <span>Predicate URI</span>
                  <span>sh:nodeKind</span>
                  <span>sh:datatype</span>
                  <span>sh:minCount</span>
                  <span>sh:maxCount</span>
                  <span>void:triples</span>
                  <span>void:distinctObjects</span>
                </div>
                {predicates.map(p => (
                  <div key={p.uri} className="predicate-row">
                    <span className="predicate-uri">{p.uri}</span>

                    <span className="predicate-cell">
                      {p.nodeKindStatus === 'loading' && <IconSpinner size={11} />}
                      {p.nodeKindStatus === 'done' && p.nodeKind && (
                        <span className={`datatype-badge ${p.nodeKind === 'sh:IRI' ? 'iri' : p.nodeKind === 'unknown' ? 'unknown' : 'literal'}`}>
                          {p.nodeKind === 'unknown' ? '—' : p.nodeKind}
                        </span>
                      )}
                      {p.nodeKindStatus === 'error' && <span className="datatype-badge error">error</span>}
                    </span>

                    <span className="predicate-cell">
                      {p.datatypeStatus === 'loading' && <IconSpinner size={11} />}
                      {p.datatypeStatus === 'done' && p.datatype && (
                        <span className={`datatype-badge ${p.datatype === 'IRI' ? 'iri' : p.datatype === 'unknown' ? 'unknown' : ''}`}>
                          {p.datatype === 'IRI' ? '—' : p.datatype === 'unknown' ? '—' : p.datatype.replace('http://www.w3.org/2001/XMLSchema#', 'xsd:')}
                        </span>
                      )}
                      {p.datatypeStatus === 'error' && <span className="datatype-badge error">error</span>}
                    </span>

                    <span className="predicate-cell predicate-count">
                      {p.minCountStatus === 'loading' && <IconSpinner size={11} />}
                      {p.minCountStatus === 'done' && <span>{p.minCount}</span>}
                      {p.minCountStatus === 'error' && <span className="datatype-badge error">error</span>}
                    </span>

                    <span className="predicate-cell predicate-count">
                      {p.maxCountStatus === 'loading' && <IconSpinner size={11} />}
                      {p.maxCountStatus === 'done' && <span>{p.maxCount || '—'}</span>}
                      {p.maxCountStatus === 'error' && <span className="datatype-badge error">error</span>}
                    </span>

                    <span className="predicate-count">{p.count.toLocaleString()}</span>

                    <span className="predicate-cell predicate-count">
                      {p.distinctObjectsStatus === 'loading' && <IconSpinner size={11} />}
                      {p.distinctObjectsStatus === 'done' && <span>{p.distinctObjects?.toLocaleString() ?? '—'}</span>}
                      {p.distinctObjectsStatus === 'error' && <span className="datatype-badge error">error</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

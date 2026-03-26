import { XSD, RDF, SH, VOID } from './types'
import type { Predicate } from './types'

export function dtTurtle(uri: string): string {
  if (uri.startsWith(XSD)) return `xsd:${uri.slice(XSD.length)}`
  if (uri.startsWith(RDF)) return `rdf:${uri.slice(RDF.length)}`
  return `<${uri}>`
}

export function generateTurtle(
  endpoint: string,
  classUri: string,
  predicates: Predicate[],
  distinctSubjects: number | null,
  totalTriples: number | null,
): string {
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
  lines.push(`@prefix rdf:  <${RDF}> .`)
  lines.push(`@prefix void: <${VOID}> .`)
  lines.push('')

  // Service description
  if (totalTriples !== null) {
    lines.push(`<${endpoint}>`)
    lines.push(`    a void:Dataset ;`)
    lines.push(`    void:triples ${totalTriples} .`)
    lines.push('')
  }

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

    if (p.variantsStatus === 'done' && p.variants && p.variants.length > 0) {
      const iri = p.variants.filter(v => v.datatype === 'IRI')
      const bn  = p.variants.filter(v => v.datatype === 'BlankNode')
      const lit = p.variants.filter(v => v.datatype !== 'IRI' && v.datatype !== 'BlankNode')
      const nodeKindCount = [iri.length > 0, bn.length > 0, lit.length > 0].filter(Boolean).length

      if (nodeKindCount > 1) {
        // Multiple nodeKinds — one unified sh:or across all variants
        const all: Array<{ triples: number; entry: string }> = [
          ...iri.map(v => ({ triples: v.triples, entry: `sh:nodeKind sh:IRI ; void:triples ${v.triples} ; void:distinctObjects ${v.distinctObjects}` })),
          ...bn.map(v =>  ({ triples: v.triples, entry: `sh:nodeKind sh:BlankNode ; void:triples ${v.triples}` })),
          ...lit.map(v => ({ triples: v.triples, entry: `sh:nodeKind sh:Literal ; sh:datatype ${dtTurtle(v.datatype)} ; void:triples ${v.triples} ; void:distinctObjects ${v.distinctObjects}` })),
        ].sort((a, b) => b.triples - a.triples)
        const maxT = all[0].triples
        const entries = all.map(v => {
          const deactivated = v.triples < maxT ? ' ; sh:deactivated true' : ''
          return `        [ ${v.entry}${deactivated} ]`
        })
        attrs.push(`    sh:or (\n${entries.join(' ,\n')}\n    )`)
      } else {
        // Single nodeKind — emit sh:nodeKind, then optionally sh:datatype / sh:or for literal variants
        if (iri.length > 0)      attrs.push(`    sh:nodeKind sh:IRI`)
        else if (bn.length > 0)  attrs.push(`    sh:nodeKind sh:BlankNode`)
        else if (lit.length > 0) attrs.push(`    sh:nodeKind sh:Literal`)

        if (lit.length === 1) {
          attrs.push(`    sh:datatype ${dtTurtle(lit[0].datatype)}`)
        } else if (lit.length > 1) {
          const maxT = Math.max(...lit.map(v => v.triples))
          const entries = lit.map(v => {
            const deactivated = v.triples < maxT ? ' ; sh:deactivated true' : ''
            return `        [ sh:datatype ${dtTurtle(v.datatype)} ; void:triples ${v.triples} ; void:distinctObjects ${v.distinctObjects}${deactivated} ]`
          })
          attrs.push(`    sh:or (\n${entries.join(' ,\n')}\n    )`)
        }
      }
    }

    if (p.minCountStatus === 'done' && p.minCount !== undefined && p.minCount > 0)
      attrs.push(`    sh:minCount ${p.minCount}`)

    if (p.maxCountStatus === 'done' && p.maxCount !== undefined && p.maxCount > 0)
      attrs.push(`    sh:maxCount ${p.maxCount}`)

    if (p.shInStatus === 'done' && Array.isArray(p.shIn) && p.shIn.length > 0)
      attrs.push(`    sh:in ( ${p.shIn.join(' ')} )`)

    attrs.push(`    void:triples ${p.count}`)

    if (p.distinctObjectsStatus === 'done' && p.distinctObjects !== undefined && p.distinctObjects > 0)
      attrs.push(`    void:distinctObjects ${p.distinctObjects}`)

    if (attrs.length > 0) {
      attrs.forEach((a, i) => lines.push(a + (i < attrs.length - 1 ? ' ;' : ' .')))
    } else {
      lines[lines.length - 1] = lines[lines.length - 1].replace(/ ;$/, ' .')
    }
  }

  return lines.join('\n')
}

import { XSD, RDF, SH, VOID, QB, SHAPETROSPECTION } from './types'
import type { ClassData, DatatypeVariant, Predicate } from './types'

export function dtTurtle(uri: string): string {
  if (uri.startsWith(XSD)) return `xsd:${uri.slice(XSD.length)}`
  if (uri.startsWith(RDF)) return `rdf:${uri.slice(RDF.length)}`
  return `<${uri}>`
}

/** Derive a skolem suffix from a DatatypeVariant datatype field. */
function variantSuffix(datatype: string): string {
  if (datatype === 'IRI') return 'IRI'
  if (datatype === 'BlankNode') return 'BlankNode'
  // For full URIs like xsd:string → "string"
  const sep = Math.max(datatype.lastIndexOf('#'), datatype.lastIndexOf('/'))
  return sep >= 0 ? datatype.substring(sep + 1) : datatype
}

interface VariantEntry {
  skolemUri: string
  triples: number
  distinctObjects: number
  defLines: string[]   // definition lines for the skolemized node
}

interface PropertyShapeResult {
  attrs: string[]           // shape attribute lines (no void:)
  variantDefs: string[]     // skolemized variant node definition blocks
  variantObservations: Array<{ uri: string; triples: number; distinctObjects: number }>
}

function buildVariantEntry(
  propShapeUri: string,
  v: DatatypeVariant,
  maxTriples: number,
  shClass?: string[] | null,
): VariantEntry {
  const uri = `${propShapeUri}-${variantSuffix(v.datatype)}`
  const defLines: string[] = []
  const deactivated = v.triples < maxTriples

  if (v.datatype === 'IRI') {
    defLines.push(`    sh:nodeKind sh:IRI`)
    if (shClass && shClass.length === 1) {
      defLines.push(`    sh:class <${shClass[0]}>`)
    } else if (shClass && shClass.length > 1) {
      const orItems = shClass.map(c => `[ sh:class <${c}> ]`).join(' ')
      defLines.push(`    sh:or ( ${orItems} )`)
    }
  } else if (v.datatype === 'BlankNode') {
    defLines.push(`    sh:nodeKind sh:BlankNode`)
  } else {
    defLines.push(`    sh:nodeKind sh:Literal`)
    defLines.push(`    sh:datatype ${dtTurtle(v.datatype)}`)
  }
  if (deactivated) defLines.push(`    sh:deactivated true`)

  return { skolemUri: uri, triples: v.triples, distinctObjects: v.distinctObjects, defLines }
}

function propertyShapeAttrs(p: Predicate, propShapeUri: string): PropertyShapeResult {
  const attrs: string[] = []
  const variantDefs: string[] = []
  const variantObservations: PropertyShapeResult['variantObservations'] = []

  const shClass = p.shClassStatus === 'done' ? p.shClass : null

  if (p.variantsStatus === 'done' && p.variants && p.variants.length > 0) {
    const iri = p.variants.filter(v => v.datatype === 'IRI')
    const bn  = p.variants.filter(v => v.datatype === 'BlankNode')
    const lit = p.variants.filter(v => v.datatype !== 'IRI' && v.datatype !== 'BlankNode')
    const nodeKindCount = [iri.length > 0, bn.length > 0, lit.length > 0].filter(Boolean).length

    if (nodeKindCount > 1) {
      // Mixed node kinds → sh:or with skolemized variants
      const allVariants = [...iri, ...bn, ...lit].sort((a, b) => b.triples - a.triples)
      const maxT = allVariants[0].triples
      const entries = allVariants.map(v =>
        buildVariantEntry(propShapeUri, v, maxT, v.datatype === 'IRI' ? shClass : undefined),
      )

      const orRefs = entries.map(e => `        <${e.skolemUri}>`)
      attrs.push(`    sh:or (\n${orRefs.join('\n')}\n    )`)

      for (const e of entries) {
        variantDefs.push('')
        variantDefs.push(`<${e.skolemUri}>`)
        e.defLines.forEach((l, i) => variantDefs.push(l + (i < e.defLines.length - 1 ? ' ;' : ' .')))
        variantObservations.push({ uri: e.skolemUri, triples: e.triples, distinctObjects: e.distinctObjects })
      }
    } else {
      if (iri.length > 0) {
        attrs.push(`    sh:nodeKind sh:IRI`)
        if (shClass && shClass.length === 1) {
          attrs.push(`    sh:class <${shClass[0]}>`)
        } else if (shClass && shClass.length > 1) {
          const orItems = shClass.map(c => `[ sh:class <${c}> ]`).join(' ')
          attrs.push(`    sh:or ( ${orItems} )`)
        }
      } else if (bn.length > 0)  attrs.push(`    sh:nodeKind sh:BlankNode`)
      else if (lit.length > 0) attrs.push(`    sh:nodeKind sh:Literal`)

      if (lit.length === 1) {
        attrs.push(`    sh:datatype ${dtTurtle(lit[0].datatype)}`)
      } else if (lit.length > 1) {
        // Multiple literal datatypes → sh:or with skolemized variants
        const sorted = [...lit].sort((a, b) => b.triples - a.triples)
        const maxT = sorted[0].triples
        const entries = sorted.map(v => buildVariantEntry(propShapeUri, v, maxT))

        const orRefs = entries.map(e => `        <${e.skolemUri}>`)
        attrs.push(`    sh:or (\n${orRefs.join('\n')}\n    )`)

        for (const e of entries) {
          variantDefs.push('')
          variantDefs.push(`<${e.skolemUri}>`)
          e.defLines.forEach((l, i) => variantDefs.push(l + (i < e.defLines.length - 1 ? ' ;' : ' .')))
          variantObservations.push({ uri: e.skolemUri, triples: e.triples, distinctObjects: e.distinctObjects })
        }
      }
    }
  }

  if (p.minCountStatus === 'done' && p.minCount !== undefined && p.minCount > 0)
    attrs.push(`    sh:minCount ${p.minCount}`)

  if (p.maxCountStatus === 'done' && p.maxCount !== undefined && p.maxCount > 0)
    attrs.push(`    sh:maxCount ${p.maxCount}`)

  if (p.shInStatus === 'done' && Array.isArray(p.shIn) && p.shIn.length > 0)
    attrs.push(`    sh:in ( ${p.shIn.join(' ')} )`)

  if (p.languageInStatus === 'done' && p.languageIn && p.languageIn.length > 0)
    attrs.push(`    sh:languageIn ( ${p.languageIn.map(l => `"${l}"`).join(' ')} )`)

  if (p.uniqueLangStatus === 'done' && p.uniqueLang === true && p.languageIn && p.languageIn.length > 0)
    attrs.push(`    sh:uniqueLang true`)

  return { attrs, variantDefs, variantObservations }
}

function emitObservation(
  lines: string[],
  endpointUri: string,
  observed: string,
  measures: string[],
  nodeShapeUri?: string,
) {
  lines.push('')
  lines.push(`[] a qb:Observation ;`)
  lines.push(`    qb:dataSet <${endpointUri}> ;`)
  if (nodeShapeUri) lines.push(`    shapetrospection:shape <${nodeShapeUri}> ;`)
  lines.push(`    shapetrospection:observed ${observed} ;`)
  measures.forEach((m, i) => lines.push(m + (i < measures.length - 1 ? ' ;' : ' .')))
}

export function generateTurtle(
  endpoint: string,
  classDataList: ClassData[],
  totalTriples: number | null,
): string {
  const lines: string[] = []
  const observations: string[] = []
  const shapes: string[] = []

  // ── Prefixes ──
  lines.push(`@prefix sh:   <${SH}> .`)
  lines.push(`@prefix xsd:  <${XSD}> .`)
  lines.push(`@prefix rdf:  <${RDF}> .`)
  lines.push(`@prefix void: <${VOID}> .`)
  lines.push(`@prefix qb:   <${QB}> .`)
  lines.push(`@prefix shapetrospection: <${SHAPETROSPECTION}> .`)
  lines.push('')

  // ── Dataset ──
  if (totalTriples !== null) {
    lines.push(`<${endpoint}>`)
    lines.push(`    a void:Dataset ;`)
    lines.push(`    void:triples ${totalTriples} .`)
  }

  // ── Process each class ──
  for (const { uri: classUri, predicates, distinctSubjects } of classDataList) {
    const lastSep    = Math.max(classUri.lastIndexOf('#'), classUri.lastIndexOf('/'))
    const ns         = classUri.substring(0, lastSep + 1)
    const localName  = classUri.substring(lastSep + 1)
    const nodeShapeUri = `${ns}${localName}Shape`

    const propShapes = predicates.map(p => {
      const predLocal = p.uri.split(/[#/]/).pop() ?? 'property'
      return { uri: `${ns}${localName}Shape-${predLocal}`, p }
    })

    // NodeShape observation
    const nodeObsMeasures: string[] = []
    if (distinctSubjects !== null) nodeObsMeasures.push(`    void:distinctSubjects ${distinctSubjects}`)
    if (propShapes.length > 0) nodeObsMeasures.push(`    void:properties ${propShapes.length}`)
    if (nodeObsMeasures.length > 0) {
      emitObservation(observations, endpoint, `<${nodeShapeUri}>`, nodeObsMeasures)
    }

    // Property observations + shape generation
    const allVariantDefs: string[] = []

    for (const { uri, p } of propShapes) {
      // Property observation
      const propObsMeasures: string[] = []
      propObsMeasures.push(`    void:triples ${p.count}`)
      if (p.distinctObjectsStatus === 'done' && p.distinctObjects !== undefined && p.distinctObjects > 0)
        propObsMeasures.push(`    void:distinctObjects ${p.distinctObjects}`)
      emitObservation(
        observations,
        endpoint,
        `<${uri}>`,
        propObsMeasures,
        nodeShapeUri,
      )

      // Build property shape
      const result = propertyShapeAttrs(p, uri)

      // Variant observations
      for (const vo of result.variantObservations) {
        const voMeasures: string[] = [`    void:triples ${vo.triples}`]
        if (vo.distinctObjects > 0) voMeasures.push(`    void:distinctObjects ${vo.distinctObjects}`)
        emitObservation(observations, endpoint, `<${vo.uri}>`, voMeasures, nodeShapeUri)
      }

      // Property shape lines
      shapes.push('')
      shapes.push(`<${uri}>`)
      shapes.push(`    a sh:PropertyShape ;`)
      shapes.push(`    sh:path <${p.uri}> ;`)

      if (result.attrs.length > 0) {
        result.attrs.forEach((a, i) => shapes.push(a + (i < result.attrs.length - 1 ? ' ;' : ' .')))
      } else {
        shapes[shapes.length - 1] = shapes[shapes.length - 1].replace(/ ;$/, ' .')
      }

      // Collect variant definitions
      allVariantDefs.push(...result.variantDefs)
    }

    // Node shape (clean, no void:)
    shapes.push('')
    shapes.push(`<${nodeShapeUri}>`)
    shapes.push(`    a sh:NodeShape ;`)
    const nodeAttrs: string[] = [`    sh:targetClass <${classUri}>`]
    propShapes.forEach(({ uri }) => nodeAttrs.push(`    sh:property <${uri}>`))
    nodeAttrs.forEach((a, i) => shapes.push(a + (i < nodeAttrs.length - 1 ? ' ;' : ' .')))

    // Variant definitions
    shapes.push(...allVariantDefs)
  }

  // ── Assemble: prefixes + dataset, then observations, then shapes ──
  lines.push(...observations)
  lines.push(...shapes)

  // Remove trailing blank lines
  while (lines[lines.length - 1] === '') lines.pop()

  return lines.join('\n')
}

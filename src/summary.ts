import type { ClassData } from './types'

function localName(uri: string): string {
  const sep = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'))
  return sep >= 0 ? uri.substring(sep + 1) : uri
}

function fmt(n: number | null | undefined): string {
  return n != null ? n.toLocaleString('en-US') : '—'
}

function pad(s: string, width: number, right = false): string {
  return right ? s.padStart(width) : s.padEnd(width)
}

export function generateSummary(
  endpoint: string,
  classDataList: ClassData[],
  totalTriples: number | null,
): string {
  const lines: string[] = []

  lines.push(`Endpoint: ${endpoint}`)
  if (totalTriples !== null) {
    lines.push(`Total triples: ${fmt(totalTriples)}`)
  }
  lines.push('')

  // Compute column widths
  const classCol = 'Class'
  const instCol = 'Instances'
  const propsCol = 'Properties'
  const triplesCol = 'Triples'

  // Gather rows for width computation
  interface ClassRow { name: string; instances: string; props: string; triples: string }
  interface PredRow { name: string; triples: string; cardinality: string }
  const classRows: Array<{ classRow: ClassRow; predRows: PredRow[] }> = []

  for (const d of classDataList) {
    const predTriples = d.predicates.reduce((s, p) => s + p.count, 0)
    const classRow: ClassRow = {
      name: localName(d.uri),
      instances: fmt(d.distinctSubjects),
      props: String(d.predicates.length),
      triples: fmt(predTriples),
    }
    const predRows: PredRow[] = d.predicates.map(p => {
      const parts: string[] = []
      if (p.minCountStatus === 'done' && p.minCount !== undefined)
        parts.push(`min=${p.minCount}`)
      if (p.maxCountStatus === 'done' && p.maxCount !== undefined && p.maxCount > 0)
        parts.push(`max=${p.maxCount}`)
      return {
        name: `  ${localName(p.uri)}`,
        triples: fmt(p.count),
        cardinality: parts.join(' '),
      }
    })
    classRows.push({ classRow, predRows })
  }

  const allNames = [classCol, ...classRows.flatMap(r => [r.classRow.name, ...r.predRows.map(p => p.name)])]
  const nameW = Math.max(...allNames.map(s => s.length))
  const instW = Math.max(instCol.length, ...classRows.map(r => r.classRow.instances.length))
  const propsW = Math.max(propsCol.length, ...classRows.map(r => r.classRow.props.length))
  const tripW = Math.max(triplesCol.length, ...classRows.flatMap(r => [r.classRow.triples, ...r.predRows.map(p => p.triples)]).map(s => s.length))

  // Header
  const header = `${pad(classCol, nameW)}  ${pad(instCol, instW, true)}  ${pad(propsCol, propsW, true)}  ${pad(triplesCol, tripW, true)}`
  lines.push(header)
  lines.push('─'.repeat(header.length))

  // Data rows
  for (const { classRow, predRows } of classRows) {
    lines.push(
      `${pad(classRow.name, nameW)}  ${pad(classRow.instances, instW, true)}  ${pad(classRow.props, propsW, true)}  ${pad(classRow.triples, tripW, true)}`
    )
    for (const pr of predRows) {
      const cardSuffix = pr.cardinality ? `  ${pr.cardinality}` : ''
      lines.push(
        `${pad(pr.name, nameW)}  ${pad('', instW)}  ${pad('', propsW)}  ${pad(pr.triples, tripW, true)}${cardSuffix}`
      )
    }
  }

  // Totals
  const totalInstances = classDataList.reduce((s, d) => s + (d.distinctSubjects ?? 0), 0)
  const totalProps = classDataList.reduce((s, d) => s + d.predicates.length, 0)
  lines.push('')
  lines.push(`Totals: ${classDataList.length} classes, ${fmt(totalInstances)} instances, ${totalProps} properties`)

  return lines.join('\n')
}

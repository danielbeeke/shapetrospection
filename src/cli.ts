import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  fetchClasses,
  fetchPredicates,
  fetchVariants,
  fetchNodeKind,
  fetchMinCount,
  fetchMaxCount,
  fetchDistinctObjects,
  fetchDistinctSubjects,
  fetchTotalTriples,
} from './queries'
import { generateTurtle } from './turtle'
import { generateSummary } from './summary'
import type { ClassData, Predicate } from './types'

function parseArgs(argv: string[]): { endpoint: string; outputDir: string | null; summary: boolean } {
  const args = argv.slice(2)
  let endpoint: string | null = null
  let outputDir: string | null = null
  let summary = false

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-o' || args[i] === '--output') && args[i + 1]) {
      outputDir = args[++i]
    } else if (args[i] === '-s' || args[i] === '--summary') {
      summary = true
    } else if (!args[i].startsWith('-')) {
      endpoint = args[i]
    }
  }

  if (!endpoint) {
    console.error('Usage: shapetrospection <endpoint> [-o output_dir] [-s]')
    console.error('')
    console.error('  endpoint            SPARQL endpoint URL')
    console.error('  -o, --output <dir>  Write output here (default: stdout)')
    console.error('  -s, --summary       Print a summary table instead of Turtle')
    process.exit(1)
  }

  return { endpoint, outputDir, summary }
}

async function enrichPredicate(endpoint: string, classUri: string, p: Predicate): Promise<Predicate> {
  const [variants, nodeKinds, minCount, maxCount, distinctObjects] = await Promise.all([
    fetchVariants(endpoint, classUri, p.uri).catch(err => {
      console.error(`    variants error for <${p.uri}>: ${(err as Error).message}`)
      return undefined
    }),
    fetchNodeKind(endpoint, classUri, p.uri).catch(err => {
      console.error(`    nodeKind error for <${p.uri}>: ${(err as Error).message}`)
      return undefined
    }),
    fetchMinCount(endpoint, classUri, p.uri).catch(err => {
      console.error(`    minCount error for <${p.uri}>: ${(err as Error).message}`)
      return undefined
    }),
    fetchMaxCount(endpoint, classUri, p.uri).catch(err => {
      console.error(`    maxCount error for <${p.uri}>: ${(err as Error).message}`)
      return undefined
    }),
    fetchDistinctObjects(endpoint, classUri, p.uri).catch(err => {
      console.error(`    distinctObjects error for <${p.uri}>: ${(err as Error).message}`)
      return undefined
    }),
  ])
  return {
    ...p,
    variants,
    variantsStatus: variants !== undefined ? 'done' : 'error',
    nodeKinds,
    nodeKindStatus: nodeKinds !== undefined ? 'done' : 'error',
    minCount,
    minCountStatus: minCount !== undefined ? 'done' : 'error',
    maxCount,
    maxCountStatus: maxCount !== undefined ? 'done' : 'error',
    distinctObjects,
    distinctObjectsStatus: distinctObjects !== undefined ? 'done' : 'error',
    shInStatus: 'idle',
  }
}

async function processClass(endpoint: string, classUri: string): Promise<ClassData> {
  const [distinctSubjects, rawPredicates] = await Promise.all([
    fetchDistinctSubjects(endpoint, classUri).catch(() => null),
    fetchPredicates(endpoint, classUri).catch(err => {
      console.error(`  predicate fetch failed: ${(err as Error).message}`)
      return [] as Predicate[]
    }),
  ])

  const predicates = await Promise.all(rawPredicates.map(p => enrichPredicate(endpoint, classUri, p)))

  return {
    uri: classUri,
    distinctSubjects,
    predicatesLoading: false,
    predicatesError: null,
    predicates,
  }
}

async function main() {
  const { endpoint, outputDir, summary } = parseArgs(process.argv)

  console.error(`Connecting to ${endpoint}`)

  const [classes, totalTriples] = await Promise.all([
    fetchClasses(endpoint),
    fetchTotalTriples(endpoint).catch(() => null),
  ])

  const triplesLabel = totalTriples !== null ? `, ${totalTriples.toLocaleString()} total triples` : ''
  console.error(`Found ${classes.length} classes${triplesLabel}`)

  const classDataList: ClassData[] = []
  for (let i = 0; i < classes.length; i++) {
    const classUri = classes[i]
    console.error(`[${i + 1}/${classes.length}] <${classUri}>`)
    classDataList.push(await processClass(endpoint, classUri))
  }

  if (summary) {
    console.error('Generating summary…')
    const text = generateSummary(endpoint, classDataList, totalTriples)
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true })
      const outPath = join(outputDir, 'summary.txt')
      writeFileSync(outPath, text, 'utf-8')
      console.error(`Written to ${outPath}`)
    } else {
      process.stdout.write(text + '\n')
    }
  } else {
    console.error('Generating shapes…')
    const turtle = generateTurtle(endpoint, classDataList, totalTriples)
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true })
      const outPath = join(outputDir, 'shapes.ttl')
      writeFileSync(outPath, turtle, 'utf-8')
      console.error(`Written to ${outPath}`)
    } else {
      process.stdout.write(turtle + '\n')
    }
  }
}

main().catch(err => {
  console.error('Error:', (err as Error).message)
  process.exit(1)
})

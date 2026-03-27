import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { progress } from '@clack/prompts'
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
import { generateShEx } from './shex'
import { readCache, writeCache } from './cache'
import type { ClassData, Predicate } from './types'

interface CliArgs {
  endpoint: string
  outputDir: string | null
  summary: boolean
  shex: boolean
  forceRefresh: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2)
  let endpoint: string | null = null
  let outputDir: string | null = null
  let summary = false
  let shex = false
  let forceRefresh = false

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-o' || args[i] === '--output') && args[i + 1]) {
      outputDir = args[++i]
    } else if (args[i] === '-s' || args[i] === '--summary') {
      summary = true
    } else if (args[i] === '-x' || args[i] === '--shex') {
      shex = true
    } else if (args[i] === '-f' || args[i] === '--force-refresh') {
      forceRefresh = true
    } else if (!args[i].startsWith('-')) {
      endpoint = args[i]
    }
  }

  if (!endpoint) {
    console.error('Usage: shapetrospection <endpoint> [-o output] [-s] [-x] [-f]')
    console.error('')
    console.error('  endpoint            SPARQL endpoint URL')
    console.error('  -o, --output <file> Write output here (default: stdout)')
    console.error('  -s, --summary       Print a summary table instead of Turtle')
    console.error('  -x, --shex          Output ShEx compact syntax instead of Turtle')
    console.error('  -f, --force-refresh Ignore cached data and re-fetch from endpoint')
    process.exit(1)
  }

  return { endpoint, outputDir, summary, shex, forceRefresh }
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

function formatAge(cachedAt: string): string {
  const ms = Date.now() - new Date(cachedAt).getTime()
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

async function main() {
  const { endpoint, outputDir: outputPath, summary, shex, forceRefresh } = parseArgs(process.argv)

  let classDataList: ClassData[]
  let totalTriples: number | null

  const cached = !forceRefresh ? readCache(endpoint) : null
  if (cached) {
    console.error(`Using cached data for ${endpoint} (${formatAge(cached.cachedAt)})`)
    classDataList = cached.classDataList
    totalTriples = cached.totalTriples
  } else {
    console.error(`Connecting to ${endpoint}`)

    const [classes, tt] = await Promise.all([
      fetchClasses(endpoint),
      fetchTotalTriples(endpoint).catch(() => null),
    ])
    totalTriples = tt

    const triplesLabel = totalTriples !== null ? `, ${totalTriples.toLocaleString()} total triples` : ''
    console.error(`Found ${classes.length} classes${triplesLabel}`)

    classDataList = []
    const p = progress({ max: Math.max(classes.length, 1) })
    p.start('Indexing classes')
    for (let i = 0; i < classes.length; i++) {
      const classUri = classes[i]
      p.advance(1, `Processing ${i + 1}/${classes.length}: ${classUri}`)
      classDataList.push(await processClass(endpoint, classUri))
    }
    p.stop('Class indexing complete')

    writeCache({ endpoint, totalTriples, classDataList, cachedAt: new Date().toISOString() })
  }

  if (summary) {
    console.error('Generating summary…')
    const text = generateSummary(endpoint, classDataList, totalTriples)
    process.stdout.write(text + '\n')
    if (outputPath) {
      let outPath = outputPath
      try {
        const stat = await import('node:fs/promises').then(fs => fs.stat(outputPath))
        if (stat.isDirectory()) {
          outPath = join(outputPath, 'summary.txt')
        }
      } catch {
        // outputPath doesn't exist; treat as file path and create parent dir
        mkdirSync(join(outputPath, '..'), { recursive: true })
      }
      writeFileSync(outPath, text, 'utf-8')
      console.error(`Written to ${outPath}`)
    } else {
      process.stdout.write(text + '\n')
    }
  } else if (shex) {
    console.error('Generating ShEx shapes…')
    const shexOutput = generateShEx(endpoint, classDataList, totalTriples)
    if (outputPath) {
      let outPath = outputPath
      try {
        const stat = await import('node:fs/promises').then(fs => fs.stat(outputPath))
        if (stat.isDirectory()) {
          outPath = join(outputPath, 'shapes.shex')
        }
      } catch {
        mkdirSync(join(outputPath, '..'), { recursive: true })
      }
      writeFileSync(outPath, shexOutput, 'utf-8')
      console.error(`Written to ${outPath}`)
    } else {
      process.stdout.write(shexOutput + '\n')
    }
  } else {
    console.error('Generating shapes…')
    const turtle = generateTurtle(endpoint, classDataList, totalTriples)
    if (outputPath) {
      let outPath = outputPath
      try {
        const stat = await import('node:fs/promises').then(fs => fs.stat(outputPath))
        if (stat.isDirectory()) {
          outPath = join(outputPath, 'shapes.ttl')
        }
      } catch {
        // outputPath doesn't exist; treat as file path and create parent dir
        mkdirSync(join(outputPath, '..'), { recursive: true })
      }
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

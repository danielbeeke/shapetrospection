// Run with: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchClasses, fetchShClass, fetchShIn, termToTurtle } from './queries'
import type { SparqlTerm } from './types'

test('IRIs are written as <...>', () => {
  assert.equal(termToTurtle({ type: 'uri', value: 'http://ex.org/a' }), '<http://ex.org/a>')
})

test('newlines in language-tagged literals are escaped', () => {
  const term = { type: 'literal' as const, value: 'regel 1\nregel 2', 'xml:lang': 'nl' }
  assert.equal(termToTurtle(term), '"regel 1\\nregel 2"@nl')
})

test('quotes, backslashes, tabs and carriage returns are escaped', () => {
  const term = { type: 'literal' as const, value: 'a "b" \\ c\td\r' }
  assert.equal(termToTurtle(term), '"a \\"b\\" \\\\ c\\td\\r"')
})

test('typed literals keep their datatype', () => {
  const term = {
    type: 'literal' as const,
    value: 'x\ny',
    datatype: 'http://www.w3.org/2001/XMLSchema#string',
  }
  assert.equal(termToTurtle(term), '"x\\ny"^^xsd:string')
})

// Answer every SPARQL request with these bindings; return the queries sent.
function mockEndpoint(bindings: { [k: string]: SparqlTerm }[]): string[] {
  const queries: string[] = []
  globalThis.fetch = (async (url: string) => {
    queries.push(new URL(url).searchParams.get('query') ?? '')
    return { ok: true, json: async () => ({ results: { bindings } }) }
  }) as unknown as typeof fetch
  return queries
}

test('blank-node classes get no shape', async () => {
  mockEndpoint([
    { class: { type: 'uri', value: 'http://ex.org/A' } },
    { class: { type: 'bnode', value: 'node5781292' } },
  ])
  assert.deepEqual(await fetchClasses('http://ex.org/sparql'), ['http://ex.org/A'])
})

test('no sh:in when a value is a blank node', async () => {
  mockEndpoint([
    { value: { type: 'uri', value: 'http://ex.org/x' } },
    { value: { type: 'bnode', value: 'node5781292' } },
  ])
  assert.equal(await fetchShIn('http://ex.org/sparql', 'http://ex.org/A', 'http://ex.org/p'), null)
})

test('sh:class only considers IRI classes', async () => {
  const queries = mockEndpoint([{ class: { type: 'uri', value: 'http://ex.org/B' } }])
  await fetchShClass('http://ex.org/sparql', 'http://ex.org/A', 'http://ex.org/p')
  assert.match(queries[0], /FILTER\(isIRI\(\?class\)\)/)
})

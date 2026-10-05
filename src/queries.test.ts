// Run with: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { termToTurtle } from './queries'

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

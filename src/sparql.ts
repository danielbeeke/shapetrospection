import type { SparqlTerm } from './types'

export async function sparqlQuery(
  endpoint: string,
  query: string,
): Promise<{ [k: string]: SparqlTerm }[]> {
  const url = new URL(endpoint)
  url.searchParams.set('query', query)
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/sparql-results+json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return json.results.bindings
}

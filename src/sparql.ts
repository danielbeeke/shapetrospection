import type { SparqlTerm } from './types'

export async function sparqlQuery(
  endpoint: string,
  query: string,
  token: string | null = null,
): Promise<{ [k: string]: SparqlTerm }[]> {
  const url = new URL(endpoint)
  url.searchParams.set('query', query)
  const headers: Record<string, string> = { Accept: 'application/sparql-results+json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return json.results.bindings
}

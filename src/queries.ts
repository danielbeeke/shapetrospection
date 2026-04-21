import { sparqlQuery } from './sparql'
import { XSD } from './types'
import type { DatatypeVariant, NodeKindVariant, Predicate, SparqlTerm } from './types'

const CLASSES_QUERY = `SELECT DISTINCT ?class WHERE { [] a ?class . } ORDER BY ?class`

export async function fetchClasses(endpoint: string): Promise<string[]> {
  const rows = await sparqlQuery(endpoint, CLASSES_QUERY)
  return rows.map(b => b.class.value)
}

export async function fetchPredicates(endpoint: string, classUri: string): Promise<Predicate[]> {
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
    variantsStatus: 'idle' as const,
    nodeKindStatus: 'idle' as const,
    minCountStatus: 'idle' as const,
    maxCountStatus: 'idle' as const,
    distinctObjectsStatus: 'idle' as const,
    shInStatus: 'idle' as const,
    shClassStatus: 'idle' as const,
  }))
}

export async function fetchVariants(
  endpoint: string,
  classUri: string,
  predicateUri: string,
): Promise<DatatypeVariant[]> {
  const query = `SELECT ?datatype (COUNT(?o) AS ?triples) (COUNT(DISTINCT ?o) AS ?distinctObjects)
WHERE {
  {
    ?s a <${classUri}> ; <${predicateUri}> ?o .
    FILTER(isIRI(?o))
    BIND(<urn:shapetrospection:IRI> AS ?datatype)
  } UNION {
    ?s a <${classUri}> ; <${predicateUri}> ?o .
    FILTER(isBlank(?o))
    BIND(<urn:shapetrospection:BlankNode> AS ?datatype)
  } UNION {
    ?s a <${classUri}> ; <${predicateUri}> ?o .
    FILTER(isLiteral(?o))
    BIND(DATATYPE(?o) AS ?datatype)
    FILTER(BOUND(?datatype))
  }
}
GROUP BY ?datatype
ORDER BY DESC(?triples)`
  const rows = await sparqlQuery(endpoint, query)
  return rows.map(r => ({
    datatype: r.datatype.value === 'urn:shapetrospection:IRI' ? 'IRI'
            : r.datatype.value === 'urn:shapetrospection:BlankNode' ? 'BlankNode'
            : r.datatype.value,
    triples: parseInt(r.triples.value, 10),
    distinctObjects: parseInt(r.distinctObjects.value, 10),
  }))
}

export async function fetchNodeKind(
  endpoint: string,
  classUri: string,
  predicateUri: string,
): Promise<NodeKindVariant[]> {
  const query = `SELECT ?nodeKind (COUNT(?o) AS ?triples)
WHERE {
  ?s a <${classUri}> ;
     <${predicateUri}> ?o .
  BIND(IF(isIRI(?o), <http://www.w3.org/ns/shacl#IRI>,
       IF(isBlank(?o), <http://www.w3.org/ns/shacl#BlankNode>,
       <http://www.w3.org/ns/shacl#Literal>)) AS ?nodeKind)
}
GROUP BY ?nodeKind
ORDER BY DESC(?triples)`
  const rows = await sparqlQuery(endpoint, query)
  return rows.map(r => ({
    nodeKind: r.nodeKind.value.replace('http://www.w3.org/ns/shacl#', 'sh:'),
    triples: parseInt(r.triples.value, 10),
  }))
}

export async function fetchMinCount(
  endpoint: string,
  classUri: string,
  predicateUri: string,
): Promise<number> {
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

export async function fetchMaxCount(
  endpoint: string,
  classUri: string,
  predicateUri: string,
): Promise<number> {
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

export async function fetchDistinctObjects(
  endpoint: string,
  classUri: string,
  predicateUri: string,
): Promise<number> {
  const query = `SELECT (COUNT(DISTINCT ?o) AS ?distinctObjects)
WHERE {
  ?s a <${classUri}> ;
     <${predicateUri}> ?o .
}`
  const rows = await sparqlQuery(endpoint, query)
  if (rows.length === 0 || !rows[0].distinctObjects) return 0
  return parseInt(rows[0].distinctObjects.value, 10)
}

export async function fetchDistinctSubjects(
  endpoint: string,
  classUri: string,
): Promise<number> {
  const query = `SELECT (COUNT(DISTINCT ?s) AS ?distinctSubjects)
WHERE {
  ?s a <${classUri}> .
}`
  const rows = await sparqlQuery(endpoint, query)
  if (rows.length === 0 || !rows[0].distinctSubjects) return 0
  return parseInt(rows[0].distinctSubjects.value, 10)
}

export async function fetchTotalTriples(endpoint: string): Promise<number> {
  const query = `SELECT (COUNT(*) AS ?triples) WHERE { ?s ?p ?o . }`
  const rows = await sparqlQuery(endpoint, query)
  if (rows.length === 0 || !rows[0].triples) return 0
  return parseInt(rows[0].triples.value, 10)
}

const SH_CLASS_LIMIT = 5

export async function fetchShClass(
  endpoint: string,
  classUri: string,
  predicateUri: string,
): Promise<string[] | null> {
  const query = `SELECT DISTINCT ?class
WHERE {
  ?s a <${classUri}> ; <${predicateUri}> ?o .
  FILTER(isIRI(?o))
  ?o a ?class .
}
ORDER BY ?class
LIMIT ${SH_CLASS_LIMIT + 1}`
  const rows = await sparqlQuery(endpoint, query)
  if (rows.length > SH_CLASS_LIMIT) return null
  return rows.map(r => r.class.value)
}

const SH_IN_LIMIT = 10

function termToTurtle(term: SparqlTerm): string {
  if (term.type === 'uri') return `<${term.value}>`
  if (term.datatype) {
    const dt = term.datatype.startsWith(XSD)
      ? `xsd:${term.datatype.slice(XSD.length)}`
      : `<${term.datatype}>`
    return `"${term.value}"^^${dt}`
  }
  if (term['xml:lang']) return `"${term.value}"@${term['xml:lang']}`
  return `"${term.value}"`
}

export async function fetchShIn(
  endpoint: string,
  classUri: string,
  predicateUri: string,
): Promise<string[] | null> {
  const query = `SELECT DISTINCT ?value
WHERE {
  ?s a <${classUri}> ;
     <${predicateUri}> ?value .
}
ORDER BY ?value
LIMIT ${SH_IN_LIMIT + 1}`
  const rows = await sparqlQuery(endpoint, query)
  if (rows.length > SH_IN_LIMIT) return null
  return rows.map(r => termToTurtle(r.value))
}

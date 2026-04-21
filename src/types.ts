export type FetchStatus = 'idle' | 'loading' | 'done' | 'error'

export interface SparqlTerm {
  type: 'uri' | 'literal' | 'bnode'
  value: string
  datatype?: string
  'xml:lang'?: string
}

export interface DatatypeVariant {
  datatype: string    // full xsd:* URI, or 'IRI', or 'BlankNode'
  triples: number
  distinctObjects: number
}

export interface NodeKindVariant {
  nodeKind: string   // sh:IRI | sh:Literal | sh:BlankNode
  triples: number
}

export interface Predicate {
  uri: string
  count: number
  variantsStatus: FetchStatus
  variants?: DatatypeVariant[]
  nodeKindStatus: FetchStatus
  nodeKinds?: NodeKindVariant[]
  minCountStatus: FetchStatus
  minCount?: number
  maxCountStatus: FetchStatus
  maxCount?: number
  distinctObjectsStatus: FetchStatus
  distinctObjects?: number
  shInStatus: FetchStatus
  shIn?: string[] | null   // null = too many values; string[] = Turtle-serialised terms
  shClassStatus: FetchStatus
  shClass?: string[] | null // null = too many classes; string[] = class URIs
  languageInStatus: FetchStatus
  languageIn?: string[]         // language tags, e.g. ["en", "nl", "de"]
  uniqueLangStatus: FetchStatus
  uniqueLang?: boolean          // true = at most one value per language per subject
}

export interface ClassData {
  uri: string
  distinctSubjects: number | null
  predicatesLoading: boolean
  predicatesError: string | null
  predicates: Predicate[]
}

export const XSD  = 'http://www.w3.org/2001/XMLSchema#'
export const RDF  = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
export const SH   = 'http://www.w3.org/ns/shacl#'
export const VOID = 'http://rdfs.org/ns/void#'
export const QB   = 'http://purl.org/linked-data/cube#'
export const SHAPETROSPECTION = 'urn:shapetrospection:'

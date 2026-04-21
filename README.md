# Shapetrospection

Generate SHACL shapes and ShEx expressions from the data in a SPARQL endpoint.

Webapp available at [shapetrospection.shapething.com](https://shapetrospection.shapething.com)

## CLI

```sh
npx shapetrospection <endpoint> [options]
```

### Options

| Flag | Description |
|---|---|
| `-o, --output <file>` | Write output to a file (default: stdout) |
| `-c, --class <name>` | Only process classes matching this name |
| `-s, --summary` | Print a summary table instead of Turtle |
| `-x, --shex` | Output ShEx compact syntax instead of Turtle |
| `-f, --force-refresh` | Ignore cached data and re-fetch from endpoint |

### Examples

```sh
# SHACL Turtle to stdout
npx shapetrospection https://example.org/sparql

# Save to file
npx shapetrospection https://example.org/sparql -o shapes.ttl

# ShEx output
npx shapetrospection https://example.org/sparql --shex -o shapes.shex

# Single class only
npx shapetrospection https://example.org/sparql -c Restaurant

# Summary table
npx shapetrospection https://example.org/sparql -s

# Syntax highlighting with rich (pip install rich-cli)
npx shapetrospection https://example.org/sparql -c Restaurant \
  | rich --syntax --lexer turtle --force-terminal -

# ShEx with syntax highlighting
npx shapetrospection https://example.org/sparql -c Restaurant --shex \
  | rich --syntax --lexer turtle --force-terminal -
```

### Caching

Results are cached in `~/.cache/shapetrospection/` after the first run. Subsequent runs against the same endpoint use the cache. Pass `-f` to re-fetch. The `-c` filter applies at output time, so a full cached run gives you instant access to any class afterwards.

### Discovered constraints

The following SHACL constraints are inferred from the data:

| Constraint | Description |
|---|---|
| `sh:targetClass` | The `rdf:type` class each shape describes |
| `sh:path` | Predicates used by instances of the class |
| `sh:nodeKind` | Whether values are IRIs, literals, or blank nodes |
| `sh:datatype` | XSD/RDF datatype of literal values |
| `sh:class` | `rdf:type` of IRI-valued objects (up to 5 classes) |
| `sh:minCount` / `sh:maxCount` | Cardinality bounds across all instances |
| `sh:in` | Enumerated value set (when ≤10 distinct values) |
| `sh:languageIn` | Language tags present on language-tagged literals |
| `sh:uniqueLang` | Whether each subject has at most one value per language |
| `sh:or` | Mixed node kinds or multiple literal datatypes |
| `sh:deactivated` | Marks minority variants in `sh:or` branches |

### Output format

The default Turtle output separates SHACL shapes from statistical observations. Shapes contain structural constraints, while statistics (triple counts, distinct subjects/objects) are reified as `qb:Observation` instances linked via `shapetrospection:observed`.

## Development

```sh
npm i
```

Start the webapp:

```sh
npm run dev
```

Use the CLI during development:

```sh
npm run cli -- https://example.org/sparql -o shapes.ttl
```

Build both the webapp and CLI:

```sh
npm run build
```


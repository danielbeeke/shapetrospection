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
```

### Caching

Results are cached in `~/.cache/shapetrospection/` after the first run. Subsequent runs against the same endpoint use the cache. Pass `-f` to re-fetch.

### Output format

The default Turtle output separates SHACL shapes from statistical observations. Shapes contain structural constraints (node kinds, datatypes, cardinality), while statistics are reified as `qb:Observation` instances linked via `shapetrospection:observed`.

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


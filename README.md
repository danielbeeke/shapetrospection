# A tool to generate shape for RDF data

Generate SHACL shapes to describe the classes available in a SPARQL endpoint.

Webapp available at [shapetrospection.shapething.com](https://shapetrospection.shapething.com)

Use as CLI:

```sh
npx shapetrospection https://api.nightly.triplydb.com/datasets/DanielBeeke/efteling/sparql -o shape.shacl.ttl
```

## Development

```sh
npm i
```

Start the webapp

```sh
npm run dev
```

Use the CLI:

```sh
npm run cli -- https://api.nightly.triplydb.com/datasets/DanielBeeke/efteling/sparql -o shape.shacl.ttl
```


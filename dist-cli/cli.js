#!/usr/bin/env node

// src/cli.ts
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { progress } from "@clack/prompts";

// src/sparql.ts
async function sparqlQuery(endpoint, query) {
  const url = new URL(endpoint);
  url.searchParams.set("query", query);
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/sparql-results+json" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.results.bindings;
}

// src/types.ts
var XSD = "http://www.w3.org/2001/XMLSchema#";
var RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
var SH = "http://www.w3.org/ns/shacl#";
var VOID = "http://rdfs.org/ns/void#";

// src/queries.ts
var CLASSES_QUERY = `SELECT DISTINCT ?class WHERE { [] a ?class . } ORDER BY ?class`;
async function fetchClasses(endpoint) {
  const rows = await sparqlQuery(endpoint, CLASSES_QUERY);
  return rows.map((b) => b.class.value);
}
async function fetchPredicates(endpoint, classUri) {
  const query = `SELECT DISTINCT ?predicate (COUNT(?s) AS ?count)
WHERE {
  ?s a <${classUri}> ;
     ?predicate ?o .
  FILTER(?predicate != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>)
}
GROUP BY ?predicate
ORDER BY DESC(?count)`;
  const rows = await sparqlQuery(endpoint, query);
  return rows.map((b) => ({
    uri: b.predicate.value,
    count: parseInt(b.count.value, 10),
    variantsStatus: "idle",
    nodeKindStatus: "idle",
    minCountStatus: "idle",
    maxCountStatus: "idle",
    distinctObjectsStatus: "idle",
    shInStatus: "idle"
  }));
}
async function fetchVariants(endpoint, classUri, predicateUri) {
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
ORDER BY DESC(?triples)`;
  const rows = await sparqlQuery(endpoint, query);
  return rows.map((r) => ({
    datatype: r.datatype.value === "urn:shapetrospection:IRI" ? "IRI" : r.datatype.value === "urn:shapetrospection:BlankNode" ? "BlankNode" : r.datatype.value,
    triples: parseInt(r.triples.value, 10),
    distinctObjects: parseInt(r.distinctObjects.value, 10)
  }));
}
async function fetchNodeKind(endpoint, classUri, predicateUri) {
  const query = `SELECT ?nodeKind (COUNT(?o) AS ?triples)
WHERE {
  ?s a <${classUri}> ;
     <${predicateUri}> ?o .
  BIND(IF(isIRI(?o), <http://www.w3.org/ns/shacl#IRI>,
       IF(isBlank(?o), <http://www.w3.org/ns/shacl#BlankNode>,
       <http://www.w3.org/ns/shacl#Literal>)) AS ?nodeKind)
}
GROUP BY ?nodeKind
ORDER BY DESC(?triples)`;
  const rows = await sparqlQuery(endpoint, query);
  return rows.map((r) => ({
    nodeKind: r.nodeKind.value.replace("http://www.w3.org/ns/shacl#", "sh:"),
    triples: parseInt(r.triples.value, 10)
  }));
}
async function fetchMinCount(endpoint, classUri, predicateUri) {
  const query = `SELECT (MIN(?cnt) AS ?minCount)
WHERE {
  { SELECT ?s (COUNT(?o) AS ?cnt) WHERE {
      ?s a <${classUri}> .
      OPTIONAL { ?s <${predicateUri}> ?o . }
    } GROUP BY ?s
  }
}`;
  const rows = await sparqlQuery(endpoint, query);
  if (rows.length === 0 || !rows[0].minCount) return 0;
  return parseInt(rows[0].minCount.value, 10);
}
async function fetchMaxCount(endpoint, classUri, predicateUri) {
  const query = `SELECT (MAX(?cnt) AS ?maxCount)
WHERE {
  { SELECT ?s (COUNT(?o) AS ?cnt) WHERE {
      ?s a <${classUri}> ;
         <${predicateUri}> ?o .
    } GROUP BY ?s
  }
}`;
  const rows = await sparqlQuery(endpoint, query);
  if (rows.length === 0 || !rows[0].maxCount) return 0;
  return parseInt(rows[0].maxCount.value, 10);
}
async function fetchDistinctObjects(endpoint, classUri, predicateUri) {
  const query = `SELECT (COUNT(DISTINCT ?o) AS ?distinctObjects)
WHERE {
  ?s a <${classUri}> ;
     <${predicateUri}> ?o .
}`;
  const rows = await sparqlQuery(endpoint, query);
  if (rows.length === 0 || !rows[0].distinctObjects) return 0;
  return parseInt(rows[0].distinctObjects.value, 10);
}
async function fetchDistinctSubjects(endpoint, classUri) {
  const query = `SELECT (COUNT(DISTINCT ?s) AS ?distinctSubjects)
WHERE {
  ?s a <${classUri}> .
}`;
  const rows = await sparqlQuery(endpoint, query);
  if (rows.length === 0 || !rows[0].distinctSubjects) return 0;
  return parseInt(rows[0].distinctSubjects.value, 10);
}
async function fetchTotalTriples(endpoint) {
  const query = `SELECT (COUNT(*) AS ?triples) WHERE { ?s ?p ?o . }`;
  const rows = await sparqlQuery(endpoint, query);
  if (rows.length === 0 || !rows[0].triples) return 0;
  return parseInt(rows[0].triples.value, 10);
}

// src/turtle.ts
function dtTurtle(uri) {
  if (uri.startsWith(XSD)) return `xsd:${uri.slice(XSD.length)}`;
  if (uri.startsWith(RDF)) return `rdf:${uri.slice(RDF.length)}`;
  return `<${uri}>`;
}
function propertyShapeAttrs(p) {
  const attrs = [];
  if (p.variantsStatus === "done" && p.variants && p.variants.length > 0) {
    const iri = p.variants.filter((v) => v.datatype === "IRI");
    const bn = p.variants.filter((v) => v.datatype === "BlankNode");
    const lit = p.variants.filter((v) => v.datatype !== "IRI" && v.datatype !== "BlankNode");
    const nodeKindCount = [iri.length > 0, bn.length > 0, lit.length > 0].filter(Boolean).length;
    if (nodeKindCount > 1) {
      const all = [
        ...iri.map((v) => ({ triples: v.triples, entry: `sh:nodeKind sh:IRI ; void:triples ${v.triples} ; void:distinctObjects ${v.distinctObjects}` })),
        ...bn.map((v) => ({ triples: v.triples, entry: `sh:nodeKind sh:BlankNode ; void:triples ${v.triples}` })),
        ...lit.map((v) => ({ triples: v.triples, entry: `sh:nodeKind sh:Literal ; sh:datatype ${dtTurtle(v.datatype)} ; void:triples ${v.triples} ; void:distinctObjects ${v.distinctObjects}` }))
      ].sort((a, b) => b.triples - a.triples);
      const maxT = all[0].triples;
      const entries = all.map((v) => {
        const deactivated = v.triples < maxT ? " ; sh:deactivated true" : "";
        return `        [ ${v.entry}${deactivated} ]`;
      });
      attrs.push(`    sh:or (
${entries.join(" ,\n")}
    )`);
    } else {
      if (iri.length > 0) attrs.push(`    sh:nodeKind sh:IRI`);
      else if (bn.length > 0) attrs.push(`    sh:nodeKind sh:BlankNode`);
      else if (lit.length > 0) attrs.push(`    sh:nodeKind sh:Literal`);
      if (lit.length === 1) {
        attrs.push(`    sh:datatype ${dtTurtle(lit[0].datatype)}`);
      } else if (lit.length > 1) {
        const maxT = Math.max(...lit.map((v) => v.triples));
        const entries = lit.map((v) => {
          const deactivated = v.triples < maxT ? " ; sh:deactivated true" : "";
          return `        [ sh:datatype ${dtTurtle(v.datatype)} ; void:triples ${v.triples} ; void:distinctObjects ${v.distinctObjects}${deactivated} ]`;
        });
        attrs.push(`    sh:or (
${entries.join(" ,\n")}
    )`);
      }
    }
  }
  if (p.minCountStatus === "done" && p.minCount !== void 0 && p.minCount > 0)
    attrs.push(`    sh:minCount ${p.minCount}`);
  if (p.maxCountStatus === "done" && p.maxCount !== void 0 && p.maxCount > 0)
    attrs.push(`    sh:maxCount ${p.maxCount}`);
  if (p.shInStatus === "done" && Array.isArray(p.shIn) && p.shIn.length > 0)
    attrs.push(`    sh:in ( ${p.shIn.join(" ")} )`);
  attrs.push(`    void:triples ${p.count}`);
  if (p.distinctObjectsStatus === "done" && p.distinctObjects !== void 0 && p.distinctObjects > 0)
    attrs.push(`    void:distinctObjects ${p.distinctObjects}`);
  return attrs;
}
function generateTurtle(endpoint, classDataList, totalTriples) {
  const lines = [];
  lines.push(`@prefix sh:   <${SH}> .`);
  lines.push(`@prefix xsd:  <${XSD}> .`);
  lines.push(`@prefix rdf:  <${RDF}> .`);
  lines.push(`@prefix void: <${VOID}> .`);
  lines.push("");
  if (totalTriples !== null) {
    lines.push(`<${endpoint}>`);
    lines.push(`    a void:Dataset ;`);
    lines.push(`    void:triples ${totalTriples} .`);
    lines.push("");
  }
  for (const { uri: classUri, predicates, distinctSubjects } of classDataList) {
    const lastSep = Math.max(classUri.lastIndexOf("#"), classUri.lastIndexOf("/"));
    const ns = classUri.substring(0, lastSep + 1);
    const localName2 = classUri.substring(lastSep + 1);
    const nodeShapeUri = `${ns}${localName2}Shape`;
    const propShapes = predicates.map((p) => {
      const predLocal = p.uri.split(/[#/]/).pop() ?? "property";
      return { uri: `${ns}${localName2}Shape-${predLocal}`, p };
    });
    lines.push(`<${nodeShapeUri}>`);
    lines.push(`    a sh:NodeShape ;`);
    const nodeAttrs = [`    sh:targetClass <${classUri}>`];
    if (distinctSubjects !== null) nodeAttrs.push(`    void:distinctSubjects ${distinctSubjects}`);
    if (propShapes.length > 0) nodeAttrs.push(`    void:properties ${propShapes.length}`);
    propShapes.forEach(({ uri }) => nodeAttrs.push(`    sh:property <${uri}>`));
    nodeAttrs.forEach((a, i) => lines.push(a + (i < nodeAttrs.length - 1 ? " ;" : " .")));
    for (const { uri, p } of propShapes) {
      lines.push("");
      lines.push(`<${uri}>`);
      lines.push(`    a sh:PropertyShape ;`);
      lines.push(`    sh:path <${p.uri}> ;`);
      const attrs = propertyShapeAttrs(p);
      if (attrs.length > 0) {
        attrs.forEach((a, i) => lines.push(a + (i < attrs.length - 1 ? " ;" : " .")));
      } else {
        lines[lines.length - 1] = lines[lines.length - 1].replace(/ ;$/, " .");
      }
    }
    lines.push("");
  }
  while (lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

// src/summary.ts
function localName(uri) {
  const sep = Math.max(uri.lastIndexOf("#"), uri.lastIndexOf("/"));
  return sep >= 0 ? uri.substring(sep + 1) : uri;
}
function fmt(n) {
  return n != null ? n.toLocaleString("en-US") : "\u2014";
}
function pad(s, width, right = false) {
  return right ? s.padStart(width) : s.padEnd(width);
}
function generateSummary(endpoint, classDataList, totalTriples) {
  const lines = [];
  lines.push(`Endpoint: ${endpoint}`);
  if (totalTriples !== null) {
    lines.push(`Total triples: ${fmt(totalTriples)}`);
  }
  lines.push("");
  const classCol = "Class";
  const instCol = "Instances";
  const propsCol = "Properties";
  const triplesCol = "Triples";
  const classRows = [];
  for (const d of classDataList) {
    const predTriples = d.predicates.reduce((s, p) => s + p.count, 0);
    const classRow = {
      name: localName(d.uri),
      instances: fmt(d.distinctSubjects),
      props: String(d.predicates.length),
      triples: fmt(predTriples)
    };
    const predRows = d.predicates.map((p) => {
      const parts = [];
      if (p.minCountStatus === "done" && p.minCount !== void 0)
        parts.push(`min=${p.minCount}`);
      if (p.maxCountStatus === "done" && p.maxCount !== void 0 && p.maxCount > 0)
        parts.push(`max=${p.maxCount}`);
      return {
        name: `  ${localName(p.uri)}`,
        triples: fmt(p.count),
        cardinality: parts.join(" ")
      };
    });
    classRows.push({ classRow, predRows });
  }
  const allNames = [classCol, ...classRows.flatMap((r) => [r.classRow.name, ...r.predRows.map((p) => p.name)])];
  const nameW = Math.max(...allNames.map((s) => s.length));
  const instW = Math.max(instCol.length, ...classRows.map((r) => r.classRow.instances.length));
  const propsW = Math.max(propsCol.length, ...classRows.map((r) => r.classRow.props.length));
  const tripW = Math.max(triplesCol.length, ...classRows.flatMap((r) => [r.classRow.triples, ...r.predRows.map((p) => p.triples)]).map((s) => s.length));
  const header = `${pad(classCol, nameW)}  ${pad(instCol, instW, true)}  ${pad(propsCol, propsW, true)}  ${pad(triplesCol, tripW, true)}`;
  lines.push(header);
  lines.push("\u2500".repeat(header.length));
  for (const { classRow, predRows } of classRows) {
    lines.push(
      `${pad(classRow.name, nameW)}  ${pad(classRow.instances, instW, true)}  ${pad(classRow.props, propsW, true)}  ${pad(classRow.triples, tripW, true)}`
    );
    for (const pr of predRows) {
      const cardSuffix = pr.cardinality ? `  ${pr.cardinality}` : "";
      lines.push(
        `${pad(pr.name, nameW)}  ${pad("", instW)}  ${pad("", propsW)}  ${pad(pr.triples, tripW, true)}${cardSuffix}`
      );
    }
  }
  const totalInstances = classDataList.reduce((s, d) => s + (d.distinctSubjects ?? 0), 0);
  const totalProps = classDataList.reduce((s, d) => s + d.predicates.length, 0);
  lines.push("");
  lines.push(`Totals: ${classDataList.length} classes, ${fmt(totalInstances)} instances, ${totalProps} properties`);
  return lines.join("\n");
}

// src/cli.ts
function parseArgs(argv) {
  const args = argv.slice(2);
  let endpoint = null;
  let outputDir = null;
  let summary = false;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "-o" || args[i] === "--output") && args[i + 1]) {
      outputDir = args[++i];
    } else if (args[i] === "-s" || args[i] === "--summary") {
      summary = true;
    } else if (!args[i].startsWith("-")) {
      endpoint = args[i];
    }
  }
  if (!endpoint) {
    console.error("Usage: shapetrospection <endpoint> [-o output_dir] [-s]");
    console.error("");
    console.error("  endpoint            SPARQL endpoint URL");
    console.error("  -o, --output <file> Write output here (default: stdout)");
    console.error("  -s, --summary       Print a summary table instead of Turtle");
    process.exit(1);
  }
  return { endpoint, outputDir, summary };
}
async function enrichPredicate(endpoint, classUri, p) {
  const [variants, nodeKinds, minCount, maxCount, distinctObjects] = await Promise.all([
    fetchVariants(endpoint, classUri, p.uri).catch((err) => {
      console.error(`    variants error for <${p.uri}>: ${err.message}`);
      return void 0;
    }),
    fetchNodeKind(endpoint, classUri, p.uri).catch((err) => {
      console.error(`    nodeKind error for <${p.uri}>: ${err.message}`);
      return void 0;
    }),
    fetchMinCount(endpoint, classUri, p.uri).catch((err) => {
      console.error(`    minCount error for <${p.uri}>: ${err.message}`);
      return void 0;
    }),
    fetchMaxCount(endpoint, classUri, p.uri).catch((err) => {
      console.error(`    maxCount error for <${p.uri}>: ${err.message}`);
      return void 0;
    }),
    fetchDistinctObjects(endpoint, classUri, p.uri).catch((err) => {
      console.error(`    distinctObjects error for <${p.uri}>: ${err.message}`);
      return void 0;
    })
  ]);
  return {
    ...p,
    variants,
    variantsStatus: variants !== void 0 ? "done" : "error",
    nodeKinds,
    nodeKindStatus: nodeKinds !== void 0 ? "done" : "error",
    minCount,
    minCountStatus: minCount !== void 0 ? "done" : "error",
    maxCount,
    maxCountStatus: maxCount !== void 0 ? "done" : "error",
    distinctObjects,
    distinctObjectsStatus: distinctObjects !== void 0 ? "done" : "error",
    shInStatus: "idle"
  };
}
async function processClass(endpoint, classUri) {
  const [distinctSubjects, rawPredicates] = await Promise.all([
    fetchDistinctSubjects(endpoint, classUri).catch(() => null),
    fetchPredicates(endpoint, classUri).catch((err) => {
      console.error(`  predicate fetch failed: ${err.message}`);
      return [];
    })
  ]);
  const predicates = await Promise.all(rawPredicates.map((p) => enrichPredicate(endpoint, classUri, p)));
  return {
    uri: classUri,
    distinctSubjects,
    predicatesLoading: false,
    predicatesError: null,
    predicates
  };
}
async function main() {
  const { endpoint, outputDir: outputPath, summary } = parseArgs(process.argv);
  console.error(`Connecting to ${endpoint}`);
  const [classes, totalTriples] = await Promise.all([
    fetchClasses(endpoint),
    fetchTotalTriples(endpoint).catch(() => null)
  ]);
  const triplesLabel = totalTriples !== null ? `, ${totalTriples.toLocaleString()} total triples` : "";
  console.error(`Found ${classes.length} classes${triplesLabel}`);
  const classDataList = [];
  const p = progress({ max: Math.max(classes.length, 1) });
  p.start("Indexing classes");
  for (let i = 0; i < classes.length; i++) {
    const classUri = classes[i];
    p.advance(1, `Processing ${i + 1}/${classes.length}: ${classUri}`);
    classDataList.push(await processClass(endpoint, classUri));
  }
  p.stop("Class indexing complete");
  for (let i = 0; i < classes.length; i++) {
    const classUri = classes[i];
    console.error(`[${i + 1}/${classes.length}] <${classUri}>`);
    classDataList.push(await processClass(endpoint, classUri));
  }
  if (summary) {
    console.error("Generating summary\u2026");
    const text = generateSummary(endpoint, classDataList, totalTriples);
    process.stdout.write(text + "\n");
    if (outputPath) {
      let outPath = outputPath;
      try {
        const stat = await import("fs/promises").then((fs) => fs.stat(outputPath));
        if (stat.isDirectory()) {
          outPath = join(outputPath, "summary.txt");
        }
      } catch {
        mkdirSync(join(outputPath, ".."), { recursive: true });
      }
      writeFileSync(outPath, text, "utf-8");
      console.error(`Written to ${outPath}`);
    } else {
      process.stdout.write(text + "\n");
    }
  } else {
    console.error("Generating shapes\u2026");
    const turtle = generateTurtle(endpoint, classDataList, totalTriples);
    if (outputPath) {
      let outPath = outputPath;
      try {
        const stat = await import("fs/promises").then((fs) => fs.stat(outputPath));
        if (stat.isDirectory()) {
          outPath = join(outputPath, "shapes.ttl");
        }
      } catch {
        mkdirSync(join(outputPath, ".."), { recursive: true });
      }
      writeFileSync(outPath, turtle, "utf-8");
      console.error(`Written to ${outPath}`);
    } else {
      process.stdout.write(turtle + "\n");
    }
  }
}
main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

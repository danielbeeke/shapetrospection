#!/usr/bin/env node

// src/cli.ts
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync2 } from "fs";
import { join as join2 } from "path";
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
var QB = "http://purl.org/linked-data/cube#";
var SHAPETROSPECTION = "urn:shapetrospection:";

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
function variantSuffix(datatype) {
  if (datatype === "IRI") return "IRI";
  if (datatype === "BlankNode") return "BlankNode";
  const sep = Math.max(datatype.lastIndexOf("#"), datatype.lastIndexOf("/"));
  return sep >= 0 ? datatype.substring(sep + 1) : datatype;
}
function buildVariantEntry(propShapeUri, v, maxTriples) {
  const uri = `${propShapeUri}-${variantSuffix(v.datatype)}`;
  const defLines = [];
  const deactivated = v.triples < maxTriples;
  if (v.datatype === "IRI") {
    defLines.push(`    sh:nodeKind sh:IRI`);
  } else if (v.datatype === "BlankNode") {
    defLines.push(`    sh:nodeKind sh:BlankNode`);
  } else {
    defLines.push(`    sh:nodeKind sh:Literal`);
    defLines.push(`    sh:datatype ${dtTurtle(v.datatype)}`);
  }
  if (deactivated) defLines.push(`    sh:deactivated true`);
  return { skolemUri: uri, triples: v.triples, distinctObjects: v.distinctObjects, defLines };
}
function propertyShapeAttrs(p, propShapeUri) {
  const attrs = [];
  const variantDefs = [];
  const variantObservations = [];
  if (p.variantsStatus === "done" && p.variants && p.variants.length > 0) {
    const iri = p.variants.filter((v) => v.datatype === "IRI");
    const bn = p.variants.filter((v) => v.datatype === "BlankNode");
    const lit = p.variants.filter((v) => v.datatype !== "IRI" && v.datatype !== "BlankNode");
    const nodeKindCount = [iri.length > 0, bn.length > 0, lit.length > 0].filter(Boolean).length;
    if (nodeKindCount > 1) {
      const allVariants = [...iri, ...bn, ...lit].sort((a, b) => b.triples - a.triples);
      const maxT = allVariants[0].triples;
      const entries = allVariants.map((v) => buildVariantEntry(propShapeUri, v, maxT));
      const orRefs = entries.map((e) => `        <${e.skolemUri}>`);
      attrs.push(`    sh:or (
${orRefs.join("\n")}
    )`);
      for (const e of entries) {
        variantDefs.push("");
        variantDefs.push(`<${e.skolemUri}>`);
        e.defLines.forEach((l, i) => variantDefs.push(l + (i < e.defLines.length - 1 ? " ;" : " .")));
        variantObservations.push({ uri: e.skolemUri, triples: e.triples, distinctObjects: e.distinctObjects });
      }
    } else {
      if (iri.length > 0) attrs.push(`    sh:nodeKind sh:IRI`);
      else if (bn.length > 0) attrs.push(`    sh:nodeKind sh:BlankNode`);
      else if (lit.length > 0) attrs.push(`    sh:nodeKind sh:Literal`);
      if (lit.length === 1) {
        attrs.push(`    sh:datatype ${dtTurtle(lit[0].datatype)}`);
      } else if (lit.length > 1) {
        const sorted = [...lit].sort((a, b) => b.triples - a.triples);
        const maxT = sorted[0].triples;
        const entries = sorted.map((v) => buildVariantEntry(propShapeUri, v, maxT));
        const orRefs = entries.map((e) => `        <${e.skolemUri}>`);
        attrs.push(`    sh:or (
${orRefs.join("\n")}
    )`);
        for (const e of entries) {
          variantDefs.push("");
          variantDefs.push(`<${e.skolemUri}>`);
          e.defLines.forEach((l, i) => variantDefs.push(l + (i < e.defLines.length - 1 ? " ;" : " .")));
          variantObservations.push({ uri: e.skolemUri, triples: e.triples, distinctObjects: e.distinctObjects });
        }
      }
    }
  }
  if (p.minCountStatus === "done" && p.minCount !== void 0 && p.minCount > 0)
    attrs.push(`    sh:minCount ${p.minCount}`);
  if (p.maxCountStatus === "done" && p.maxCount !== void 0 && p.maxCount > 0)
    attrs.push(`    sh:maxCount ${p.maxCount}`);
  if (p.shInStatus === "done" && Array.isArray(p.shIn) && p.shIn.length > 0)
    attrs.push(`    sh:in ( ${p.shIn.join(" ")} )`);
  return { attrs, variantDefs, variantObservations };
}
function emitObservation(lines, endpointUri, observed, measures, nodeShapeUri) {
  lines.push("");
  lines.push(`[] a qb:Observation ;`);
  lines.push(`    qb:dataSet <${endpointUri}> ;`);
  if (nodeShapeUri) lines.push(`    shapetrospection:shape <${nodeShapeUri}> ;`);
  lines.push(`    shapetrospection:observed ${observed} ;`);
  measures.forEach((m, i) => lines.push(m + (i < measures.length - 1 ? " ;" : " .")));
}
function generateTurtle(endpoint, classDataList, totalTriples) {
  const lines = [];
  const observations = [];
  const shapes = [];
  lines.push(`@prefix sh:   <${SH}> .`);
  lines.push(`@prefix xsd:  <${XSD}> .`);
  lines.push(`@prefix rdf:  <${RDF}> .`);
  lines.push(`@prefix void: <${VOID}> .`);
  lines.push(`@prefix qb:   <${QB}> .`);
  lines.push(`@prefix shapetrospection: <${SHAPETROSPECTION}> .`);
  lines.push("");
  if (totalTriples !== null) {
    lines.push(`<${endpoint}>`);
    lines.push(`    a void:Dataset ;`);
    lines.push(`    void:triples ${totalTriples} .`);
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
    const nodeObsMeasures = [];
    if (distinctSubjects !== null) nodeObsMeasures.push(`    void:distinctSubjects ${distinctSubjects}`);
    if (propShapes.length > 0) nodeObsMeasures.push(`    void:properties ${propShapes.length}`);
    if (nodeObsMeasures.length > 0) {
      emitObservation(observations, endpoint, `<${nodeShapeUri}>`, nodeObsMeasures);
    }
    const allVariantDefs = [];
    for (const { uri, p } of propShapes) {
      const propObsMeasures = [];
      propObsMeasures.push(`    void:triples ${p.count}`);
      if (p.distinctObjectsStatus === "done" && p.distinctObjects !== void 0 && p.distinctObjects > 0)
        propObsMeasures.push(`    void:distinctObjects ${p.distinctObjects}`);
      emitObservation(
        observations,
        endpoint,
        `<${uri}>`,
        propObsMeasures,
        nodeShapeUri
      );
      const result = propertyShapeAttrs(p, uri);
      for (const vo of result.variantObservations) {
        const voMeasures = [`    void:triples ${vo.triples}`];
        if (vo.distinctObjects > 0) voMeasures.push(`    void:distinctObjects ${vo.distinctObjects}`);
        emitObservation(observations, endpoint, `<${vo.uri}>`, voMeasures, nodeShapeUri);
      }
      shapes.push("");
      shapes.push(`<${uri}>`);
      shapes.push(`    a sh:PropertyShape ;`);
      shapes.push(`    sh:path <${p.uri}> ;`);
      if (result.attrs.length > 0) {
        result.attrs.forEach((a, i) => shapes.push(a + (i < result.attrs.length - 1 ? " ;" : " .")));
      } else {
        shapes[shapes.length - 1] = shapes[shapes.length - 1].replace(/ ;$/, " .");
      }
      allVariantDefs.push(...result.variantDefs);
    }
    shapes.push("");
    shapes.push(`<${nodeShapeUri}>`);
    shapes.push(`    a sh:NodeShape ;`);
    const nodeAttrs = [`    sh:targetClass <${classUri}>`];
    propShapes.forEach(({ uri }) => nodeAttrs.push(`    sh:property <${uri}>`));
    nodeAttrs.forEach((a, i) => shapes.push(a + (i < nodeAttrs.length - 1 ? " ;" : " .")));
    shapes.push(...allVariantDefs);
  }
  lines.push(...observations);
  lines.push(...shapes);
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

// src/shex.ts
function variantToShEx(v) {
  if (v.datatype === "IRI") return "IRI";
  if (v.datatype === "BlankNode") return "BNode";
  return dtTurtle(v.datatype);
}
function nodeKindToShEx(nk) {
  if (nk === "sh:IRI") return "IRI";
  if (nk === "sh:BlankNode") return "BNode";
  if (nk === "sh:Literal") return "Literal";
  return ".";
}
function formatCardinality(minCount, maxCount) {
  const min = minCount !== void 0 && minCount > 0 ? minCount : 0;
  const max = maxCount !== void 0 && maxCount > 0 ? maxCount : -1;
  if (min === 1 && max === 1) return "";
  if (min === 0 && max === -1) return " *";
  if (min === 0 && max === 1) return " ?";
  if (min === 1 && max === -1) return " +";
  if (max === -1) return ` {${min},}`;
  return ` {${min},${max}}`;
}
function predicateToShEx(p) {
  let constraint;
  if (p.shInStatus === "done" && Array.isArray(p.shIn) && p.shIn.length > 0) {
    constraint = `[${p.shIn.join(" ")}]`;
  } else if (p.variantsStatus === "done" && p.variants && p.variants.length > 0) {
    const sorted = [...p.variants].sort((a, b) => b.triples - a.triples);
    if (sorted.length === 1) {
      constraint = variantToShEx(sorted[0]);
    } else {
      constraint = "(" + sorted.map((v) => variantToShEx(v)).join(" OR ") + ")";
    }
  } else if (p.nodeKindStatus === "done" && p.nodeKinds && p.nodeKinds.length > 0) {
    if (p.nodeKinds.length === 1) {
      constraint = nodeKindToShEx(p.nodeKinds[0].nodeKind);
    } else {
      constraint = "(" + p.nodeKinds.map((nk) => nodeKindToShEx(nk.nodeKind)).join(" OR ") + ")";
    }
  } else {
    constraint = ".";
  }
  const card = formatCardinality(p.minCount, p.maxCount);
  return `  <${p.uri}> ${constraint}${card}`;
}
function generateShEx(endpoint, classDataList, _totalTriples) {
  const lines = [];
  lines.push(`PREFIX xsd: <${XSD}>`);
  lines.push(`PREFIX rdf: <${RDF}>`);
  lines.push("");
  lines.push(`# Generated by shapetrospection from ${endpoint}`);
  for (const { uri: classUri, predicates } of classDataList) {
    const lastSep = Math.max(classUri.lastIndexOf("#"), classUri.lastIndexOf("/"));
    const ns = classUri.substring(0, lastSep + 1);
    const localName2 = classUri.substring(lastSep + 1);
    const shapeUri = `${ns}${localName2}Shape`;
    lines.push("");
    lines.push(`# Target class: <${classUri}>`);
    lines.push(`<${shapeUri}> {`);
    for (let i = 0; i < predicates.length; i++) {
      const sep = i < predicates.length - 1 ? " ;" : "";
      lines.push(predicateToShEx(predicates[i]) + sep);
    }
    lines.push("}");
  }
  return lines.join("\n");
}

// src/cache.ts
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
function cacheDir() {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "shapetrospection");
}
function cacheKey(endpoint) {
  return createHash("sha256").update(endpoint).digest("hex");
}
function cachePath(endpoint) {
  return join(cacheDir(), `${cacheKey(endpoint)}.json`);
}
function readCache(endpoint) {
  const path = cachePath(endpoint);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw);
    if (data.endpoint !== endpoint) return null;
    return data;
  } catch {
    return null;
  }
}
function writeCache(data) {
  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  const path = cachePath(data.endpoint);
  writeFileSync(path, JSON.stringify(data), "utf-8");
}

// src/cli.ts
function parseArgs(argv) {
  const args = argv.slice(2);
  let endpoint = null;
  let outputDir = null;
  let summary = false;
  let shex = false;
  let forceRefresh = false;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "-o" || args[i] === "--output") && args[i + 1]) {
      outputDir = args[++i];
    } else if (args[i] === "-s" || args[i] === "--summary") {
      summary = true;
    } else if (args[i] === "-x" || args[i] === "--shex") {
      shex = true;
    } else if (args[i] === "-f" || args[i] === "--force-refresh") {
      forceRefresh = true;
    } else if (!args[i].startsWith("-")) {
      endpoint = args[i];
    }
  }
  if (!endpoint) {
    console.error("Usage: shapetrospection <endpoint> [-o output] [-s] [-x] [-f]");
    console.error("");
    console.error("  endpoint            SPARQL endpoint URL");
    console.error("  -o, --output <file> Write output here (default: stdout)");
    console.error("  -s, --summary       Print a summary table instead of Turtle");
    console.error("  -x, --shex          Output ShEx compact syntax instead of Turtle");
    console.error("  -f, --force-refresh Ignore cached data and re-fetch from endpoint");
    process.exit(1);
  }
  return { endpoint, outputDir, summary, shex, forceRefresh };
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
function formatAge(cachedAt) {
  const ms = Date.now() - new Date(cachedAt).getTime();
  const secs = Math.floor(ms / 1e3);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
async function main() {
  const { endpoint, outputDir: outputPath, summary, shex, forceRefresh } = parseArgs(process.argv);
  let classDataList;
  let totalTriples;
  const cached = !forceRefresh ? readCache(endpoint) : null;
  if (cached) {
    console.error(`Using cached data for ${endpoint} (${formatAge(cached.cachedAt)})`);
    classDataList = cached.classDataList;
    totalTriples = cached.totalTriples;
  } else {
    console.error(`Connecting to ${endpoint}`);
    const [classes, tt] = await Promise.all([
      fetchClasses(endpoint),
      fetchTotalTriples(endpoint).catch(() => null)
    ]);
    totalTriples = tt;
    const triplesLabel = totalTriples !== null ? `, ${totalTriples.toLocaleString()} total triples` : "";
    console.error(`Found ${classes.length} classes${triplesLabel}`);
    classDataList = [];
    const p = progress({ max: Math.max(classes.length, 1) });
    p.start("Indexing classes");
    for (let i = 0; i < classes.length; i++) {
      const classUri = classes[i];
      p.advance(1, `Processing ${i + 1}/${classes.length}: ${classUri}`);
      classDataList.push(await processClass(endpoint, classUri));
    }
    p.stop("Class indexing complete");
    writeCache({ endpoint, totalTriples, classDataList, cachedAt: (/* @__PURE__ */ new Date()).toISOString() });
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
          outPath = join2(outputPath, "summary.txt");
        }
      } catch {
        mkdirSync2(join2(outputPath, ".."), { recursive: true });
      }
      writeFileSync2(outPath, text, "utf-8");
      console.error(`Written to ${outPath}`);
    } else {
      process.stdout.write(text + "\n");
    }
  } else if (shex) {
    console.error("Generating ShEx shapes\u2026");
    const shexOutput = generateShEx(endpoint, classDataList, totalTriples);
    if (outputPath) {
      let outPath = outputPath;
      try {
        const stat = await import("fs/promises").then((fs) => fs.stat(outputPath));
        if (stat.isDirectory()) {
          outPath = join2(outputPath, "shapes.shex");
        }
      } catch {
        mkdirSync2(join2(outputPath, ".."), { recursive: true });
      }
      writeFileSync2(outPath, shexOutput, "utf-8");
      console.error(`Written to ${outPath}`);
    } else {
      process.stdout.write(shexOutput + "\n");
    }
  } else {
    console.error("Generating shapes\u2026");
    const turtle = generateTurtle(endpoint, classDataList, totalTriples);
    if (outputPath) {
      let outPath = outputPath;
      try {
        const stat = await import("fs/promises").then((fs) => fs.stat(outputPath));
        if (stat.isDirectory()) {
          outPath = join2(outputPath, "shapes.ttl");
        }
      } catch {
        mkdirSync2(join2(outputPath, ".."), { recursive: true });
      }
      writeFileSync2(outPath, turtle, "utf-8");
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

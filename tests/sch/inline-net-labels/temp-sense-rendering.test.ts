import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { applyToPoint } from "transformation-matrix"
import { CircuitJsonToKicadSchConverter } from "lib"
import { partitionCircuitJsonBySheet } from "lib/schematic/partitionCircuitJsonBySheet"
import automotiveFixture from "../../assets/repro21-generated-system-automotive-mirror.circuit.json"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("KiCad draws TEMP_SENSE alongside its wire instead of above the wire end", async () => {
  const circuit = partitionCircuitJsonBySheet(
    automotiveFixture as CircuitJson,
    "schematic_sheet_6",
  )
  const converter = new CircuitJsonToKicadSchConverter(circuit)
  converter.runUntilFinished()
  const trace = circuit.find(
    (row) =>
      row.type === "schematic_trace" &&
      row.source_trace_id === "source_trace_187",
  )!
  if (trace.type !== "schematic_trace")
    throw new Error("Missing TEMP_SENSE wire")
  const edge = trace.edges[0]!
  const from = applyToPoint(converter.ctx.c2kMatSch!, edge.from)
  const to = applyToPoint(converter.ctx.c2kMatSch!, edge.to)

  const output = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
    generatePng: false,
  })
  const svg = output.generatedFileContent["temp_file.svg"]!.toString()
  // KiCad draws letters as SVG paths. Measure the actual TEMP_SENSE lettering.
  const glyphs = svg.match(
    /<g class="stroked-text"><desc>TEMP_SENSE<\/desc>([\s\S]*?)<\/g>/,
  )?.[1]
  expect(glyphs).toBeDefined()
  const points = [...glyphs!.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(
    ([, x, y]) => ({ x: Number(x), y: Number(y) }),
  )
  expect(points.length).toBeGreaterThan(0)
  const labelTop = Math.min(...points.map((point) => point.y))
  const labelBottom = Math.max(...points.map((point) => point.y))
  const distanceFromWire = Math.max(
    ...points.map((point) => Math.abs(point.x - from.x)),
  )

  expect(labelTop).toBeGreaterThanOrEqual(Math.min(from.y, to.y))
  expect(labelBottom).toBeLessThanOrEqual(Math.max(from.y, to.y))
  expect(distanceFromWire).toBeLessThan(2)
}, 30_000)

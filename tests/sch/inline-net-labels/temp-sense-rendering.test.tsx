import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { applyToPoint } from "transformation-matrix"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("KiCad draws TEMP_SENSE alongside its wire instead of above the wire end", async () => {
  const circuit = new Circuit()
  // C_LOAD and its vertical TEMP_SENSE stub from the temperature-sensor sheet
  // in repro21-generated-system-automotive-mirror.circuit.json. Generate it
  // through core so this regression also checks the producer's attachment.
  circuit.add(
    <board routingDisabled>
      <capacitor
        name="C_LOAD"
        capacitance="1uF"
        schX={3.5}
        schY={-1.25}
        schRotation={90}
      />
      <trace from=".C_LOAD > .pin1" to="net.TEMP_SENSE" />
      <trace from=".C_LOAD > .pin2" to="net.GND" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const text = circuitJson.find(
    (row) => row.type === "schematic_text" && row.text === "TEMP_SENSE",
  )!
  if (text.type !== "schematic_text")
    throw new Error("Missing TEMP_SENSE label")
  const trace = circuitJson.find(
    (row) =>
      row.type === "schematic_trace" &&
      row.source_trace_id === text.source_trace_id,
  )!
  if (trace.type !== "schematic_trace")
    throw new Error("Missing TEMP_SENSE wire")
  const edge = trace.edges[0]!
  expect(edge.from.x).toBe(edge.to.x)
  expect(text.position.x).toBe(edge.from.x)
  const label = converter
    .getOutput()
    .labels.find((label) => label.value === "TEMP_SENSE")!
  expect(label.at!.x).toBeCloseTo(
    applyToPoint(converter.ctx.c2kMatSch!, text.position).x,
  )
  expect(label.at!.y).toBeCloseTo(
    applyToPoint(converter.ctx.c2kMatSch!, text.position).y,
  )
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
  expect(Math.max(...points.map((point) => point.x))).toBeLessThan(from.x)
  expect(distanceFromWire).toBeLessThan(2)
}, 30_000)

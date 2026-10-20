import { beforeAll, expect, test } from "bun:test"
import type { CircuitJson, PcbVia } from "circuit-json"
import { type KicadPcb, parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

let circuitJson: CircuitJson
let physicalVias: PcbVia[]
let output: string
let pcb: KicadPcb

function convert(input: CircuitJson) {
  const converter = new CircuitJsonToKicadPcbConverter(input)
  converter.runUntilFinished()
  return converter.getOutputString()
}

beforeAll(async () => {
  const circuit = new Circuit()
  // The circuit from #676, using the default autorouting. The repository's
  // tscircuit version routes eight
  // physical vias, including six transitions between top and inner layers.
  circuit.add(
    <board width="24mm" height="16mm" layers={4}>
      <copperpour
        connectsTo="net.GND"
        layer="inner1"
        clearance="0.3mm"
        boardEdgeMargin="0.5mm"
      />
      <resistor
        name="R1"
        resistance="1k"
        footprint="0603"
        pcbX={-6}
        pcbY={4}
        connections={{ pin2: "net.GND" }}
      />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0603"
        pcbX={6}
        pcbY={4}
        connections={{ pin1: "net.GND" }}
      />
      <resistor
        name="R3"
        resistance="1k"
        footprint="0603"
        pcbX={-6}
        pcbY={-4}
        connections={{ pin2: "net.GND" }}
      />
      <resistor
        name="R4"
        resistance="1k"
        footprint="0603"
        pcbX={6}
        pcbY={-4}
        connections={{ pin1: "net.GND" }}
      />
      <trace name="A" from=".R1 > .pin1" to=".R4 > .pin2" />
      <trace name="B" from=".R2 > .pin2" to=".R3 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  circuitJson = circuit.getCircuitJson()
  physicalVias = circuitJson.filter((e) => e.type === "pcb_via")
  output = convert(circuitJson)
  pcb = parseKicadPcb(output)
}, 120000)

test("repro676: physical vias have matching inner-layer route transitions", () => {
  expect(physicalVias.length).toBeGreaterThan(0)
  const transitions = circuitJson
    .filter((e) => e.type === "pcb_trace")
    .flatMap((trace) =>
      trace.route
        .filter((point) => point.route_type === "via")
        .map((point) => ({ ...point, pcb_trace_id: trace.pcb_trace_id })),
    )
  expect(transitions).toHaveLength(physicalVias.length)
  expect(
    transitions.filter(
      (point) =>
        point.from_layer.startsWith("inner") ||
        point.to_layer.startsWith("inner"),
    ).length,
  ).toBeGreaterThan(0)
  for (const via of physicalVias) {
    expect(via.layers).toEqual(["top", "inner1", "inner2", "bottom"])
    expect(transitions).toContainEqual(
      expect.objectContaining({
        x: via.x,
        y: via.y,
        pcb_trace_id: via.pcb_trace_id,
        from_layer: via.from_layer,
        to_layer: via.to_layer,
      }),
    )
  }

  // Either representation alone exports one via per physical hole.
  const physicalOnly = circuitJson.map((e) =>
    e.type === "pcb_trace"
      ? { ...e, route: e.route.filter((point) => point.route_type !== "via") }
      : e,
  )
  const routeOnly = circuitJson.filter((e) => e.type !== "pcb_via")
  expect(parseKicadPcb(convert(physicalOnly)).vias).toHaveLength(
    physicalVias.length,
  )
  expect(parseKicadPcb(convert(routeOnly)).vias).toHaveLength(
    physicalVias.length,
  )
})

test("repro676: snapshot exported via positions, spans, sizes and nets", () => {
  expect(
    pcb.vias.map((via) => ({
      x: via.at?.x,
      y: via.at?.y,
      layers: via.layers?.names,
      size: via.size,
      drill: via.drill,
      net: pcb.nets.find((net) => net.id === via.net?.id)?.name,
    })),
  ).toMatchSnapshot()
})

// The current exporter emits fourteen vias at eight positions: six inner-layer
// transitions duplicate their physical F.Cu/B.Cu vias.
test.failing("repro676: exports one via per physical pcb_via", () => {
  expect(pcb.vias).toHaveLength(physicalVias.length)
})

test("repro676: Circuit JSON and KiCad snapshots", async () => {
  await Bun.write(
    "debug-output/repro676-inner-layer-vias.circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )
  await Bun.write("debug-output/repro676-inner-layer-vias.kicad_pcb", output)
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  // Co-located holes overlap visually; the structured snapshot and count
  // regression above distinguish them even when the PNG appears unchanged.
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 120000)

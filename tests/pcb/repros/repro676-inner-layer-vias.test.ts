import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import fixture from "../../assets/repro676-inner-layer-vias.circuit.json"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

// Generated from #676 with tscircuit 0.0.2942, retaining the board, physical
// vias, routes containing via points, and their source trace/net records.
// Freeze the routed Circuit JSON so changes in autorouting cannot hide the bug.
const circuitJson = fixture as CircuitJson
const physicalVias = circuitJson.filter((e) => e.type === "pcb_via")

function convert(input: CircuitJson) {
  const converter = new CircuitJsonToKicadPcbConverter(input)
  converter.runUntilFinished()
  return converter.getOutputString()
}

const output = convert(circuitJson)
const pcb = parseKicadPcb(output)

test("repro676: six physical vias and six matching route transitions", () => {
  expect(physicalVias).toHaveLength(6)
  const transitions = circuitJson
    .filter((e) => e.type === "pcb_trace")
    .flatMap((trace) =>
      trace.route
        .filter((point) => point.route_type === "via")
        .map((point) => ({ ...point, pcb_trace_id: trace.pcb_trace_id })),
    )
  expect(transitions).toHaveLength(6)
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

  // Either representation alone exports six vias; combining them causes #676.
  const physicalOnly = circuitJson.map((e) =>
    e.type === "pcb_trace"
      ? { ...e, route: e.route.filter((point) => point.route_type !== "via") }
      : e,
  )
  const routeOnly = circuitJson.filter((e) => e.type !== "pcb_via")
  expect(parseKicadPcb(convert(physicalOnly)).vias).toHaveLength(6)
  expect(parseKicadPcb(convert(routeOnly)).vias).toHaveLength(6)
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

// The current exporter emits ten vias at six positions. Only the four
// top/inner1 transitions duplicate the physical F.Cu/B.Cu vias.
test.failing("repro676: exports one via per physical pcb_via", () => {
  expect(pcb.vias).toHaveLength(physicalVias.length)
})

test("repro676: Circuit JSON and KiCad snapshots", async () => {
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

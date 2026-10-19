import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import circuitJson from "tests/assets/issue676-inner-layer-vias.json"

// Captured from the exact TSX and tscircuit version in #676. Keep routing out
// of this regression so changes to the autorouter cannot hide the export bug.
const physicalVias = circuitJson.filter((element) => element.type === "pcb_via")
const routeVias = (circuitJson as CircuitJson)
  .filter((element) => element.type === "pcb_trace")
  .flatMap((trace) =>
    (trace.route ?? [])
      .filter((point) => point.route_type === "via")
      .map((point) => ({ ...point, pcb_trace_id: trace.pcb_trace_id })),
  )

function convert(input: typeof circuitJson) {
  const converter = new CircuitJsonToKicadPcbConverter(input as CircuitJson)
  converter.runUntilFinished()
  return converter
}

// Conversion/setup errors must fail normally, outside test.failing.
const converter = convert(circuitJson)
const output = converter.getOutput()
const serializedOutput = converter.getOutputString()

test("#676 fixture has six physical vias and six matching route transitions", () => {
  expect(physicalVias).toHaveLength(6)
  expect(routeVias).toHaveLength(6)
  expect(
    routeVias.filter((via) =>
      [via.from_layer, via.to_layer].includes("inner1"),
    ),
  ).toHaveLength(4)

  for (const physical of physicalVias) {
    expect(physical.layers).toEqual(["top", "inner1", "inner2", "bottom"])
    const matches = routeVias.filter(
      (route) =>
        route.pcb_trace_id === physical.pcb_trace_id &&
        route.x === physical.x &&
        route.y === physical.y,
    )
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      from_layer: physical.from_layer,
      to_layer: physical.to_layer,
      via_diameter: physical.outer_diameter,
      via_hole_diameter: physical.hole_diameter,
    })
  }
})

test("#676 standalone physical records export six through vias", () => {
  const standalone = convert(
    circuitJson.filter((element) => element.type !== "pcb_trace"),
  ).getOutput()
  expect(standalone.vias).toHaveLength(6)
  for (const via of standalone.vias) {
    expect(via.layers?.names).toEqual(["F.Cu", "B.Cu"])
    expect(via.size).toBe(0.3)
    expect(via.drill).toBe(0.2)
    expect(via.net?.id).toBeGreaterThan(0)
  }
})

test("#676 route-only records export six vias with their transition spans", () => {
  const routeOnly = convert(
    circuitJson.filter((element) => element.type !== "pcb_via"),
  ).getOutput()
  expect(routeOnly.vias).toHaveLength(6)
  expect(
    routeOnly.vias.filter((via) => via.layers?.names.includes("In1.Cu")),
  ).toHaveLength(4)
  expect(
    routeOnly.vias.filter((via) => via.layers?.names.includes("B.Cu")),
  ).toHaveLength(2)
  for (const via of routeOnly.vias) {
    expect(via.size).toBe(0.3)
    expect(via.drill).toBe(0.2)
    expect(via.net?.id).toBeGreaterThan(0)
  }
})

// Remove .failing when fixing #676. On main this fails with expected 6,
// received 10: four F.Cu/In1.Cu route vias duplicate F.Cu/B.Cu physical vias.
test.failing("#676 exports each physical via once when both representations are present", () => {
  expect(serializedOutput.match(/\(via\b/g)).toHaveLength(physicalVias.length)
  expect(output.vias).toHaveLength(physicalVias.length)
  expect(
    new Set(output.vias.map((via) => `${via.at?.x}:${via.at?.y}`)).size,
  ).toBe(physicalVias.length)
})

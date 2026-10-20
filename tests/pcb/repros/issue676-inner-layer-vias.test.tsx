import { beforeAll, expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

let circuitJson: CircuitJson
let converter: CircuitJsonToKicadPcbConverter

function convert(input: CircuitJson) {
  const result = new CircuitJsonToKicadPcbConverter(input)
  result.runUntilFinished()
  return result
}

// Render and convert outside test.failing so setup errors cannot satisfy the
// expected failure. Use the repository's existing tscircuit dependency.
beforeAll(async () => {
  const circuit = new Circuit()
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
  converter = convert(circuitJson)
}, 120000)

test("#676 real circuit generates physical vias and matching inner-layer route transitions", () => {
  expect(
    circuitJson.filter((element) => element.type === "pcb_component"),
  ).toHaveLength(4)
  expect(
    circuitJson.some((element) => element.type === "pcb_copper_pour"),
  ).toBe(true)
  const physicalVias = circuitJson.filter(
    (element) => element.type === "pcb_via",
  )
  const routeVias = circuitJson
    .filter((element) => element.type === "pcb_trace")
    .flatMap((trace) =>
      trace.route
        .filter((point) => point.route_type === "via")
        .map((point) => ({ ...point, pcb_trace_id: trace.pcb_trace_id })),
    )

  expect(physicalVias.length).toBeGreaterThan(0)
  expect(routeVias).toHaveLength(physicalVias.length)
  expect(
    routeVias.some((via) => [via.from_layer, via.to_layer].includes("inner1")),
  ).toBe(true)
  expect(new Set(physicalVias.map((via) => `${via.x}:${via.y}`)).size).toBe(
    physicalVias.length,
  )
  for (const physical of physicalVias) {
    expect(
      routeVias.filter(
        (route) =>
          route.pcb_trace_id === physical.pcb_trace_id &&
          route.x === physical.x &&
          route.y === physical.y,
      ),
    ).toHaveLength(1)
  }
  const exportedVias = converter.getOutput().vias
  expect(
    new Set(exportedVias.map((via) => `${via.at?.x}:${via.at?.y}`)).size,
  ).toBe(physicalVias.length)
})

test("#676 physical-only export preserves generated via dimensions and nets", () => {
  const physicalVias = circuitJson.filter(
    (element) => element.type === "pcb_via",
  )
  const standalone = convert(
    circuitJson.filter((element) => element.type !== "pcb_trace"),
  ).getOutput()
  expect(standalone.vias).toHaveLength(physicalVias.length)
  for (const [index, via] of standalone.vias.entries()) {
    expect(via.size).toBe(physicalVias[index]!.outer_diameter)
    expect(via.drill).toBe(physicalVias[index]!.hole_diameter)
    expect(via.net?.id).toBeGreaterThan(0)
  }
})

test("#676 route-only export emits one via per generated transition", () => {
  const physicalVias = circuitJson.filter(
    (element) => element.type === "pcb_via",
  )
  const routeOnly = convert(
    circuitJson.filter((element) => element.type !== "pcb_via"),
  ).getOutput()
  expect(routeOnly.vias).toHaveLength(physicalVias.length)
  expect(
    routeOnly.vias.some((via) => via.layers?.names.includes("In1.Cu")),
  ).toBe(true)
})

// Current exporter emits 14 vias for 8 physical vias with tscircuit 0.0.2046.
// Remove .failing when fixing the duplicate physical/route representation.
test.failing("#676 exports each physical via from the real circuit once", () => {
  const physicalCount = circuitJson.filter(
    (element) => element.type === "pcb_via",
  ).length
  expect(converter.getOutputString().match(/\(via\b/g)).toHaveLength(
    physicalCount,
  )
  const vias = converter.getOutput().vias
  expect(vias).toHaveLength(physicalCount)
  expect(new Set(vias.map((via) => `${via.at?.x}:${via.at?.y}`)).size).toBe(
    physicalCount,
  )
})

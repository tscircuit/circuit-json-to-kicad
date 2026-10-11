import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { Circuit } from "tscircuit"
import sharp from "sharp"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

async function captureVias(
  converter: CircuitJsonToKicadPcbConverter,
  name: string,
  expected: number,
) {
  const vias = converter.getOutput().vias
  const uuids = new Set(vias.map((via) => via.uuid!.value))
  const rows = vias
    .flatMap((via) => via.toString().split("\n"))
    .map(
      (row, index) =>
        `<text x="40" y="${130 + index * 20}">${row.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</text>`,
    )
    .join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/><g font-family="sans-serif" font-size="17" text-anchor="middle" fill="#222"><text x="400" y="30">KiCad export of a TSX-rendered four-layer circuit.</text><text x="400" y="60">${vias.length} exported vias, ${uuids.size} unique UUIDs. Expected ${expected} via(s).</text></g><g font-family="monospace" font-size="13" fill="#222">${rows}</g></svg>`
  if (process.env.SNAPSHOT_DIR)
    await Bun.write(`${process.env.SNAPSHOT_DIR}/${name}.svg`, svg)
  return svg
}

test("top to inner1 reuses its physical through via", async () => {
  const manual = new Circuit()
  manual.add(
    <board width="20mm" height="14mm" layers={4}>
      <resistor name="R1" resistance="10k" footprint="0402" pcbX={-5} />
      <resistor name="R2" resistance="10k" footprint="0402" pcbX={5} />
      <trace
        from=".R1 > .pin2"
        to=".R2 > .pin1"
        pcbPath={[
          { x: 1, y: 0, via: true, fromLayer: "top", toLayer: "inner1" },
        ]}
      />
    </board>,
  )
  await manual.renderUntilSettled()
  const savedRoutes = manual
    .getCircuitJson()
    .filter((item) => item.type === "pcb_trace")
  // Replay the unchanged live JSX route; the group router emits full-board vias.
  const circuit = new Circuit()
  circuit.add(
    <board
      width="20mm"
      height="14mm"
      layers={4}
      minViaHoleDiameter={0.3}
      minViaPadDiameter={0.7}
      autorouter={{
        algorithmFn: async () => {
          const router = new EventEmitter()
          return Object.assign(router, {
            start: () => router.emit("complete", { traces: savedRoutes }),
            stop: () => {},
          })
        },
      }}
    >
      <resistor name="R1" resistance="10k" footprint="0402" pcbX={-5} />
      <resistor name="R2" resistance="10k" footprint="0402" pcbX={5} />
      <trace from=".R1 > .pin2" to=".R2 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const physicalVias = circuitJson.filter((item) => item.type === "pcb_via")
  expect(physicalVias).toHaveLength(1)
  const physical = physicalVias[0]!
  expect(physical.layers).toEqual(["top", "inner1", "inner2", "bottom"])
  expect([physical.outer_diameter, physical.hole_diameter]).toEqual([0.7, 0.3])
  expect(savedRoutes).toHaveLength(1)
  expect(physical.pcb_trace_id).toBe(savedRoutes[0]!.pcb_trace_id)
  const transitions = savedRoutes[0]!.route.filter(
    (point) => point.route_type === "via",
  )
  expect(transitions).toHaveLength(1)
  expect(transitions[0]).toMatchObject({
    x: physical.x,
    y: physical.y,
    from_layer: "top",
    to_layer: "inner1",
  })
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const svg = await captureVias(converter, "through-via-route-transition-0", 1)
  expect(converter.getOutput().vias).toHaveLength(1)
  expect(converter.getOutput().vias[0]).toMatchObject({ size: 0.7, drill: 0.3 })
  await expect(
    await sharp(Buffer.from(svg)).png().toBuffer(),
  ).toMatchPngSnapshot(import.meta.path, "through-via-route-transition-0")
})

test("inner2 to bottom reuses its physical through via", async () => {
  const manual = new Circuit()
  manual.add(
    <board width="20mm" height="14mm" layers={4}>
      <resistor name="R1" resistance="10k" footprint="0402" pcbX={-5} />
      <resistor name="R2" resistance="10k" footprint="0402" pcbX={5} />
      <trace
        from=".R1 > .pin2"
        to=".R2 > .pin1"
        pcbPath={[
          { x: 1, y: 0, via: true, fromLayer: "inner2", toLayer: "bottom" },
        ]}
      />
    </board>,
  )
  await manual.renderUntilSettled()
  const savedRoutes = manual
    .getCircuitJson()
    .filter((item) => item.type === "pcb_trace")
  // Replay the unchanged live JSX route; the group router emits full-board vias.
  const circuit = new Circuit()
  circuit.add(
    <board
      width="20mm"
      height="14mm"
      layers={4}
      minViaHoleDiameter={0.3}
      minViaPadDiameter={0.7}
      autorouter={{
        algorithmFn: async () => {
          const router = new EventEmitter()
          return Object.assign(router, {
            start: () => router.emit("complete", { traces: savedRoutes }),
            stop: () => {},
          })
        },
      }}
    >
      <resistor name="R1" resistance="10k" footprint="0402" pcbX={-5} />
      <resistor name="R2" resistance="10k" footprint="0402" pcbX={5} />
      <trace from=".R1 > .pin2" to=".R2 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const physicalVias = circuitJson.filter((item) => item.type === "pcb_via")
  expect(physicalVias).toHaveLength(1)
  const physical = physicalVias[0]!
  expect(physical.layers).toEqual(["top", "inner1", "inner2", "bottom"])
  expect([physical.outer_diameter, physical.hole_diameter]).toEqual([0.7, 0.3])
  expect(savedRoutes).toHaveLength(1)
  expect(physical.pcb_trace_id).toBe(savedRoutes[0]!.pcb_trace_id)
  const transitions = savedRoutes[0]!.route.filter(
    (point) => point.route_type === "via",
  )
  expect(transitions).toHaveLength(1)
  expect(transitions[0]).toMatchObject({
    x: physical.x,
    y: physical.y,
    from_layer: "inner2",
    to_layer: "bottom",
  })
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const svg = await captureVias(converter, "through-via-route-transition-1", 1)
  expect(converter.getOutput().vias).toHaveLength(1)
  expect(converter.getOutput().vias[0]).toMatchObject({ size: 0.7, drill: 0.3 })
  await expect(
    await sharp(Buffer.from(svg)).png().toBuffer(),
  ).toMatchPngSnapshot(import.meta.path, "through-via-route-transition-1")
})

test("route-only legacy diameter aliases preserve the rendered size", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board
      width="20mm"
      height="14mm"
      layers={4}
      pcbStyle={{ viaHoleDiameter: 0.3, viaPadDiameter: 0.7 }}
    >
      <resistor name="R1" resistance="10k" footprint="0402" pcbX={-5} />
      <resistor name="R2" resistance="10k" footprint="0402" pcbX={5} />
      <trace
        from=".R1 > .pin2"
        to=".R2 > .pin1"
        pcbPath={[
          { x: 1, y: 0, via: true, fromLayer: "top", toLayer: "inner1" },
        ]}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  // Exercise the legacy route-only representation of this live rendered path.
  const physical = circuit
    .getCircuitJson()
    .find((item) => item.type === "pcb_via")!
  expect([physical.outer_diameter, physical.hole_diameter]).toEqual([0.7, 0.3])
  const circuitJson = circuit
    .getCircuitJson()
    .filter((item) => item.type !== "pcb_via")
  const trace = circuitJson.find((item) => item.type === "pcb_trace")!
  const transition = trace.route.find((point) => point.route_type === "via")!
  Object.assign(transition, {
    via_diameter: physical.outer_diameter,
    via_hole_diameter: physical.hole_diameter,
  })
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const svg = await captureVias(converter, "through-via-route-aliases", 1)
  expect(converter.getOutput().vias).toHaveLength(1)
  expect(converter.getOutput().vias[0]).toMatchObject({ size: 0.7, drill: 0.3 })
  await expect(
    await sharp(Buffer.from(svg)).png().toBuffer(),
  ).toMatchPngSnapshot(import.meta.path, "through-via-route-aliases")
})

test("an unrelated coincident through via does not absorb a route transition", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="14mm" layers={4}>
      <net name="UNRELATED" />
      <via
        name="V1"
        pcbX={-4}
        pcbY={0}
        fromLayer="top"
        toLayer="bottom"
        outerDiameter={0.7}
        holeDiameter={0.3}
        connectsTo="net.UNRELATED"
      />
      <resistor name="R1" resistance="10k" footprint="0402" pcbX={-5} />
      <resistor name="R2" resistance="10k" footprint="0402" pcbX={5} />
      <trace
        from=".R1 > .pin2"
        to=".R2 > .pin1"
        pcbPath={[
          { x: 1, y: 0, via: true, fromLayer: "top", toLayer: "inner1" },
        ]}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  // Keep the explicit JSX via and the live route, omitting its redundant physical record.
  const circuitJson = circuit
    .getCircuitJson()
    .filter((item) => item.type !== "pcb_via" || item.layers.length === 4)
  const physical = circuitJson.find((item) => item.type === "pcb_via")!
  const trace = circuitJson.find((item) => item.type === "pcb_trace")!
  const transition = trace.route.find((point) => point.route_type === "via")!
  expect(physical.layers).toEqual(["top", "inner1", "inner2", "bottom"])
  expect([transition.x, transition.y]).toEqual([physical.x, physical.y])
  const sourceTrace = circuitJson
    .filter((item) => item.type === "source_trace")
    .find((item) => item.source_trace_id === trace.source_trace_id)!
  expect(physical.pcb_trace_id).not.toBe(trace.pcb_trace_id)
  expect(physical.subcircuit_connectivity_map_key).toBeDefined()
  expect(physical.subcircuit_connectivity_map_key).not.toBe(
    sourceTrace.subcircuit_connectivity_map_key,
  )
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const svg = await captureVias(converter, "through-via-unrelated", 2)
  expect(converter.getOutput().vias).toHaveLength(2)
  await expect(
    await sharp(Buffer.from(svg)).png().toBuffer(),
  ).toMatchPngSnapshot(import.meta.path, "through-via-unrelated")
})

test("aligned disjoint JSX vias retain distinct spans and UUIDs", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="8mm" layers={4}>
      <via
        name="UPPER"
        pcbX={0}
        pcbY={0}
        fromLayer="top"
        toLayer="inner1"
        outerDiameter={0.7}
        holeDiameter={0.3}
      />
      <via
        name="LOWER"
        pcbX={0}
        pcbY={0}
        fromLayer="inner2"
        toLayer="bottom"
        outerDiameter={0.7}
        holeDiameter={0.3}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson
      .filter((item) => item.type === "pcb_via")
      .map((via) => via.layers),
  ).toEqual([
    ["top", "inner1"],
    ["inner2", "bottom"],
  ])
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const svg = await captureVias(converter, "through-via-disjoint-spans", 2)
  expect(converter.getOutput().vias).toHaveLength(2)
  expect(converter.getOutput().vias.map((via) => via.layers?.names)).toEqual([
    ["F.Cu", "In1.Cu"],
    ["In2.Cu", "B.Cu"],
  ])
  expect(
    new Set(converter.getOutput().vias.map((via) => via.uuid!.value)).size,
  ).toBe(2)
  await expect(
    await sharp(Buffer.from(svg)).png().toBuffer(),
  ).toMatchPngSnapshot(import.meta.path, "through-via-disjoint-spans")
})

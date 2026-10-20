import { expect, test } from "bun:test"
import "bun-match-svg"
import { EventEmitter } from "node:events"
import type { ReactElement } from "react"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { renderKicadLayers } from "../../fixtures/render-kicad-layers"
import { renderPcbLayers } from "../../fixtures/render-pcb-layers"

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

async function checkThroughVia(
  manualBoard: ReactElement,
  snapshotName: string,
) {
  const manual = new Circuit()
  manual.add(manualBoard)
  await manual.renderUntilSettled()
  const savedRoutes = manual
    .getCircuitJson()
    .filter((element) => element.type === "pcb_trace")
  // Replay the live TSX route through the group router, which emits a through via.
  const circuit = new Circuit({
    platform: {
      autorouter: {
        algorithmFn: async () => {
          const router = new EventEmitter()
          return Object.assign(router, {
            start: () => router.emit("complete", { traces: savedRoutes }),
            stop: () => {},
          })
        },
      },
    },
  })
  circuit.add(
    <board
      width={20}
      height={14}
      layers={4}
      minViaHoleDiameter={0.3}
      minViaPadDiameter={0.7}
    >
      <resistor name="R1" resistance="10k" footprint="0402" pcbX={-5} />
      <resistor name="R2" resistance="10k" footprint="0402" pcbX={5} />
      <trace from=".R1 > .pin2" to=".R2 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const physicalVias = circuitJson.filter(
    (element) => element.type === "pcb_via",
  )
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
    from_layer: physical.from_layer,
    to_layer: physical.to_layer,
  })
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  await captureVias(converter, snapshotName, 1)
  await expect(
    renderPcbLayers(
      circuitJson,
      `${physical.from_layer} -> ${physical.to_layer}: one physical via; KiCad exports ${converter.getOutput().vias.length} (expected 1).`,
    ),
  ).toMatchSvgSnapshot(import.meta.path, `${snapshotName}-pcb-layers`)
  await expect(
    await renderKicadLayers(
      converter.getOutputString(),
      `${physical.from_layer} -> ${physical.to_layer}: KiCad output; ${converter.getOutput().vias.length} coincident vias (expected 1).`,
    ),
  ).toMatchSvgSnapshot(import.meta.path, `${snapshotName}-kicad-layers`)
  expect(converter.getOutput().vias).toHaveLength(1)
  expect(converter.getOutput().vias[0]).toMatchObject({ size: 0.7, drill: 0.3 })
}

test.failing("top to inner1 reuses its physical through via", async () => {
  await checkThroughVia(
    <board width={20} height={14} layers={4}>
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
    "through-via-route-transition-0",
  )
}, 120000)

test.failing("inner2 to bottom reuses its physical through via", async () => {
  await checkThroughVia(
    <board width={20} height={14} layers={4}>
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
    "through-via-route-transition-1",
  )
}, 120000)

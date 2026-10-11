import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import type { PcbTrace } from "circuit-json"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test.failing("an inner-layer route transition reuses its physical through via", async () => {
  const counts = []
  for (const [from, to] of [
    ["top", "inner1"],
    ["inner2", "bottom"],
  ] as const) {
    let savedRoutes: PcbTrace[] | undefined
    let circuit = new Circuit()
    // Replay JSX-rendered pcbPath routes through the group router, which emits
    // full-board physical vias. No route or via records are hand-authored.
    for (const replay of [false, true]) {
      circuit = new Circuit()
      circuit.add(
        <board
          width="20mm"
          height="14mm"
          layers={4}
          minViaHoleDiameter={0.3}
          minViaPadDiameter={0.7}
          autorouter={
            replay
              ? {
                  algorithmFn: async () => {
                    const router = new EventEmitter()
                    return Object.assign(router, {
                      start: () =>
                        router.emit("complete", { traces: savedRoutes }),
                      stop: () => {},
                    })
                  },
                }
              : undefined
          }
        >
          <resistor name="R1" resistance="10k" footprint="0402" pcbX={-5} />
          <resistor name="R2" resistance="10k" footprint="0402" pcbX={5} />
          <trace
            from=".R1 > .pin2"
            to=".R2 > .pin1"
            pcbPath={
              replay
                ? undefined
                : [{ x: 1, y: 0, via: true, fromLayer: from, toLayer: to }]
            }
          />
        </board>,
      )
      await circuit.renderUntilSettled()
      savedRoutes = circuit
        .getCircuitJson()
        .filter((item) => item.type === "pcb_trace")
    }
    const circuitJson = circuit.getCircuitJson()
    const physicalVias = circuitJson.filter((item) => item.type === "pcb_via")
    expect(physicalVias).toHaveLength(1)
    const physical = physicalVias[0]!
    expect(physical.layers).toEqual(["top", "inner1", "inner2", "bottom"])
    expect([physical.outer_diameter, physical.hole_diameter]).toEqual([
      0.7, 0.3,
    ])
    expect(savedRoutes).toHaveLength(1)
    expect(physical.pcb_trace_id).toBe(savedRoutes![0]!.pcb_trace_id)
    const transition = savedRoutes![0]!.route.filter(
      (point) => point.route_type === "via",
    )
    expect(transition).toHaveLength(1)
    expect(transition[0]).toMatchObject({
      x: physical.x,
      y: physical.y,
      from_layer: from,
      to_layer: to,
    })
    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
    const vias = converter.getOutput().vias
    expect(
      vias.some(
        (via) =>
          via.layers?.names.includes("F.Cu") &&
          via.layers?.names.includes("B.Cu") &&
          via.size === 0.7 &&
          via.drill === 0.3,
      ),
    ).toBe(true)
    const uuids = new Set(vias.map((via) => via.uuid!.value))
    const escape = (text: string) =>
      text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    const rows = vias
      .flatMap((via) => via.toString().split("\n"))
      .map(
        (row, index) =>
          `<text x="40" y="${130 + index * 20}">${escape(row)}</text>`,
      )
      .join("")
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/><g font-family="sans-serif" font-size="17" text-anchor="middle" fill="#222"><text x="400" y="30">KiCad export of a TSX-rendered four-layer circuit.</text><text x="400" y="60">1 physical barrel / ${vias.length} exported vias, ${uuids.size} unique UUIDs. Expected 1 via.</text></g><g font-family="monospace" font-size="13" fill="#222">${rows}</g></svg>`
    if (process.env.SNAPSHOT_DIR)
      await Bun.write(`${process.env.SNAPSHOT_DIR}/${from}-${to}.svg`, svg)
    counts.push(vias.length)
  }
  expect(counts).toEqual([1, 1])
})

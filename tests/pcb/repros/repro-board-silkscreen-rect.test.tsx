import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("board-level silkscreen rect is exported to KiCad", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <silkscreenrect pcbX={5} pcbY={5} width={2} height={1} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson() as CircuitJson

  const silkscreenRect = circuitJson.find(
    (element) => element.type === "pcb_silkscreen_rect",
  )
  expect(silkscreenRect).toBeDefined()
  expect(
    silkscreenRect && "pcb_component_id" in silkscreenRect
      ? silkscreenRect.pcb_component_id
      : undefined,
  ).toBeFalsy()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = parseKicadPcb(converter.getOutputString())

  const silkscreenPolys = pcb.graphicPolys.filter((poly) =>
    poly.layer?.names.includes("F.SilkS"),
  )
  expect(silkscreenPolys).toHaveLength(1)

  // Board center (0, 0) maps to KiCad (100, 100) with Y pointing down
  const points = silkscreenPolys[0]!.points!.points.map((point) => ({
    x: (point as { x: number }).x,
    y: (point as { y: number }).y,
  }))
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  expect(Math.min(...xs)).toBeCloseTo(104)
  expect(Math.max(...xs)).toBeCloseTo(106)
  expect(Math.min(...ys)).toBeCloseTo(94.5)
  expect(Math.max(...ys)).toBeCloseTo(95.5)
})

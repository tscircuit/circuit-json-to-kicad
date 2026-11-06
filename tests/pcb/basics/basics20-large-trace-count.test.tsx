import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createElement } from "react"
import { Circuit } from "tscircuit"

test("PCB export preserves traces at and above the default iteration limit", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={60} height={50}>
      {Array.from({ length: 2000 }, (_, index) => {
        const x = (index % 50) - 25
        const y = Math.floor(index / 50) - 20
        const layer = index % 2 === 0 ? "top" : "bottom"
        const route = [
          { route_type: "wire" as const, x, y, width: 0.2, layer },
          { route_type: "wire" as const, x: x + 0.5, y, width: 0.2, layer },
        ]
        return createElement("pcbtrace", { key: index, route })
      })}
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const traces = circuitJson.filter((element) => element.type === "pcb_trace")
  const otherElements = circuitJson.filter(
    (element) => element.type !== "pcb_trace",
  )
  expect(traces).toHaveLength(2000)

  for (const traceCount of [0, 999, 1000, 1001, 2000]) {
    const converter = new CircuitJsonToKicadPcbConverter([
      ...otherElements,
      ...traces.slice(0, traceCount),
    ])
    converter.runUntilFinished()

    const pcb = parseKicadPcb(converter.getOutputString())
    expect(pcb.segments).toHaveLength(traceCount)
    for (const [index, segment] of pcb.segments.entries()) {
      const x = (index % 50) - 25
      const y = Math.floor(index / 50) - 20
      expect(segment.start).toMatchObject({ x: 100 + x, y: 100 - y })
      expect(segment.end).toMatchObject({ x: 100 + x + 0.5, y: 100 - y })
      expect(segment.width).toBe(0.2)
      expect(segment.layer?.names).toEqual([index % 2 === 0 ? "F.Cu" : "B.Cu"])
    }
  }
})

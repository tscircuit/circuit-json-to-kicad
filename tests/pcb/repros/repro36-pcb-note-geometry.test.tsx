import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("standalone PCB notes preserve geometry, stroke styles, fills, and bottom layers", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="24mm" routingDisabled>
      <pcbnoterect
        pcbX={-6}
        pcbY={5}
        width={4}
        height={2}
        strokeWidth={0.3}
        layer="bottom"
        isStrokeDashed
      />
      <pcbnoterect
        pcbX={6}
        pcbY={5}
        width={4}
        height={2}
        isFilled
        hasStroke={false}
      />
      <pcbnoterect pcbX={-6} pcbY={-5} width={4} height={2} hasStroke={false} />
      <pcbnoteline
        x1={-4}
        y1={0}
        x2={0}
        y2={2}
        strokeWidth={0.4}
        layer="bottom"
        isDashed
      />
      <pcbnotepath
        route={[
          { x: 0, y: 0 },
          { x: 2, y: 2 },
          { x: 4, y: 0 },
        ]}
        strokeWidth={0.15}
        layer="bottom"
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()
  const original = JSON.stringify(json)
  const converter = new CircuitJsonToKicadPcbConverter(json)
  converter.runUntilFinished()
  const pcb = parseKicadPcb(converter.getOutputString())
  expect(pcb.graphicRects).toHaveLength(2)
  const rectangle = pcb.graphicRects[0]!
  expect(rectangle.layer?.names).toEqual(["B.Fab"])
  expect(rectangle.start).toMatchObject({ x: 92, y: 94 })
  expect(rectangle.end).toMatchObject({ x: 96, y: 96 })
  expect(rectangle.stroke?.width).toBe(0.3)
  expect(rectangle.stroke?.type).toBe("dash")
  expect(pcb.graphicRects[1]?.fill).toBe(true)
  expect(pcb.graphicRects[1]?.stroke?.width).toBe(0)
  const lines = pcb.graphicLines.filter((line) =>
    line.layer?.names.includes("B.Fab"),
  )
  expect(lines).toHaveLength(3)
  expect(lines[0]?.start).toMatchObject({ x: 96, y: 100 })
  expect(lines[0]?.end).toMatchObject({ x: 100, y: 98 })
  expect(lines[0]?.stroke?.type).toBe("dash")
  expect(lines[0]?.stroke?.width).toBe(0.4)
  expect(lines[1]?.end).toMatchObject({ x: 102, y: 98 })
  expect(lines[2]?.end).toMatchObject({ x: 104, y: 100 })
  expect(lines[2]?.stroke?.width).toBe(0.15)
  expect(JSON.stringify(json)).toBe(original)
})

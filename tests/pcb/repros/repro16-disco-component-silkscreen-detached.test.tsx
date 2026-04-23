import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { KicadPcb } from "kicadts"

test("component silkscreen paths stay inside the footprint instead of becoming board graphics", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <diode name="D1" footprint="0603" pcbX={0} pcbY={0} pcbRotation={70} />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]
  const pcbComponent = circuitJson.find(
    (entry) => entry.type === "pcb_component",
  )

  expect(pcbComponent).toBeDefined()

  circuitJson.push({
    type: "pcb_silkscreen_path",
    pcb_silkscreen_path_id: "pcb_silkscreen_path_repro16",
    pcb_component_id: pcbComponent!.pcb_component_id,
    layer: "top",
    stroke_width: 0.1,
    route: [
      { x: pcbComponent!.center.x - 1, y: pcbComponent!.center.y - 0.4 },
      { x: pcbComponent!.center.x + 1, y: pcbComponent!.center.y - 0.4 },
      { x: pcbComponent!.center.x + 1, y: pcbComponent!.center.y + 0.4 },
      { x: pcbComponent!.center.x - 1, y: pcbComponent!.center.y + 0.4 },
    ],
  })

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  const kicadPcb = KicadPcb.parse(outputString)[0] as KicadPcb

  const d1 = kicadPcb.footprints[0]
  expect(d1).toBeDefined()
  expect(d1!.fpLines.length).toBeGreaterThan(0)

  const silkscreenGraphicLines = kicadPcb.graphicLines.filter(
    (line) =>
      line.layer?.getString() === "F.SilkS" ||
      line.layer?.getString() === "B.SilkS",
  )

  expect(silkscreenGraphicLines.length).toBe(0)
})

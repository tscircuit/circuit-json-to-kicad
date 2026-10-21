import { expect, test } from "bun:test"
import { At, parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("PCB note dimensions preserve labels, arrows, offsets, rotation, and layers", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="24mm" routingDisabled>
      <pcbnotedimension
        from={{ x: -4, y: 4 }}
        to={{ x: 4, y: 4 }}
        fontSize={0.8}
        arrowSize={0.5}
      />
      <pcbnotedimension
        from={{ x: 6, y: -4 }}
        to={{ x: 6, y: 2 }}
        text="HEIGHT"
        fontSize={1}
        arrowSize={0.4}
        offset={2}
        offsetDirection={{ x: 1, y: 0 }}
        layer="bottom"
      />
      <pcbnotedimension
        from={{ x: -3, y: -4 }}
        to={{ x: -3, y: -4 }}
        fontSize={0.8}
        arrowSize={0.5}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const original = JSON.stringify(circuitJson)
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = parseKicadPcb(output)
  const lines = pcb.graphicLines.filter((line) =>
    line.layer?.names.some((name) => name.endsWith(".Fab")),
  )
  expect(lines).toHaveLength(6)
  expect(pcb.graphicPolys).toHaveLength(4)
  expect(pcb.graphicTexts).toHaveLength(2)
  const label = pcb.graphicTexts.find((text) => text.text === "8mm")!
  expect(label.layer?.names).toEqual(["F.Fab"])
  expect(label.position?.x).toBe(100)
  expect(label.position?.y).toBeCloseTo(95.25)
  expect(label.effects?.font?.size).toEqual({ width: 0.8, height: 0.8 })
  const customLabel = pcb.graphicTexts.find((text) => text.text === "HEIGHT")!
  expect(customLabel.layer?.names).toEqual(["B.Fab"])
  expect((customLabel.position as At).angle).toBeCloseTo(90)
  const bottomLines = lines.filter((line) =>
    line.layer?.names.includes("B.Fab"),
  )
  expect(bottomLines[0]?.start?.x).toBe(108)
  expect(bottomLines[0]?.start?.y).toBeCloseTo(103.6)
  expect(bottomLines[0]?.end?.y).toBeCloseTo(98.4)
  expect(bottomLines[1]?.start?.x).toBe(106)
  expect(bottomLines[1]?.end?.x).toBeCloseTo(108.4)
  const annotations = [...lines, ...pcb.graphicPolys, ...pcb.graphicTexts]
  expect(new Set(annotations.map((graphic) => String(graphic.uuid))).size).toBe(
    annotations.length,
  )
  expect(output).not.toMatch(/NaN|Infinity/)
  expect(JSON.stringify(circuitJson)).toBe(original)
  const repeat = new CircuitJsonToKicadPcbConverter(circuitJson)
  repeat.runUntilFinished()
  expect(repeat.getOutputString()).toBe(output)
})

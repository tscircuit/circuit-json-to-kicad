import { expect, test } from "bun:test"
import { Dimension, parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("PCB note dimensions retain both components of a diagonal offset", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="24mm" height="16mm" routingDisabled>
      <pcbnotedimension
        from={{ x: -4, y: 0 }}
        to={{ x: 4, y: 0 }}
        offset={2}
        offsetDirection={{ x: 1, y: 1 }}
        fontSize={0.8}
        arrowSize={0.5}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = parseKicadPcb(output)
  const dimension = pcb.otherChildren.find(
    (child) => child instanceof Dimension,
  )!
  const shift = 2 / Math.sqrt(2)
  expect(dimension.height?.value).toBe(0)
  expect(dimension.pts?.points).toMatchObject([
    { x: expect.closeTo(96 + shift), y: expect.closeTo(100 - shift) },
    { x: expect.closeTo(104 + shift), y: expect.closeTo(100 - shift) },
  ])
  const extensions = pcb.graphicLines.filter((line) =>
    line.layer?.names.includes("F.Fab"),
  )
  expect(extensions).toHaveLength(2)
  expect(extensions[0]?.start).toMatchObject({ x: 96, y: 100 })
  expect(extensions[1]?.start).toMatchObject({ x: 104, y: 100 })
  const extensionShift = (2 + 0.5) / Math.sqrt(2)
  expect(extensions[0]?.end?.x).toBeCloseTo(96 + extensionShift)
  expect(extensions[1]?.end?.x).toBeCloseTo(104 + extensionShift)
  expect(extensions[0]?.end?.y).toBeCloseTo(100 - extensionShift)
  expect(dimension.style?.extensionHeight?.value).toBe(0)
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    generatePng: false,
  })
  expect(snapshot.exitCode).toBe(0)
})

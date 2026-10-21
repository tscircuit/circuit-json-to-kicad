import { expect, test } from "bun:test"
import { At, Dimension, parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

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
  const dimensions = pcb.otherChildren.filter(
    (child) => child instanceof Dimension,
  )
  expect(dimensions).toHaveLength(2)
  const measurement = dimensions.find(
    (dimension) => dimension.grText?.text === "8mm",
  )!
  expect(measurement.layer?.names).toEqual(["F.Fab"])
  expect(measurement.pts?.points).toMatchObject([
    { x: 96, y: 96 },
    { x: 104, y: 96 },
  ])
  expect(measurement.grText?.effects?.font?.size).toEqual({
    width: 0.8,
    height: 0.8,
  })
  expect(measurement.style?.arrowLength?.value).toBe(0.5)
  const custom = dimensions.find(
    (dimension) => dimension.grText?.text === "HEIGHT",
  )!
  expect(custom.layer?.names).toEqual(["B.Fab"])
  expect(custom.height?.value).toBe(2)
  expect((custom.grText?.position as At).angle).toBe(90)
  expect(custom.style?.arrowLength?.value).toBe(0.4)
  expect(
    new Set(dimensions.map((dimension) => String(dimension.uuid))).size,
  ).toBe(2)
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    generatePng: false,
  })
  expect(snapshot.exitCode).toBe(0)
  const svg = snapshot.generatedFileContent["temp_file.svg"]!.toString()
  expect(svg).toContain("<desc>8mm</desc>")
  expect(svg).toContain("<desc>HEIGHT</desc>")
  expect(output).not.toMatch(/NaN|Infinity/)
  expect(JSON.stringify(circuitJson)).toBe(original)
  const repeat = new CircuitJsonToKicadPcbConverter(circuitJson)
  repeat.runUntilFinished()
  expect(repeat.getOutputString()).toBe(output)
})

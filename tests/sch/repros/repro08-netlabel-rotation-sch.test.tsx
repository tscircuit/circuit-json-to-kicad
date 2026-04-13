import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { parseKicadSch } from "kicadts"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("repro08 netlabel rotation schematic", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board>
      <chip
        name="U2"
        footprint="pushbutton"
        pcbY={-14}
        pcbX={-3}
        schPinArrangement={{
          topSide: {
            direction: "top-to-bottom",
            pins: [1, 2],
          },
          bottomSide: {
            direction: "bottom-to-top",
            pins: [3, 4],
          },
        }}
      />
      <netlabel
        net="ONE"
        connectsTo={".U2 > .pin1"}
        schRotation={90}
        schY={1}
        schX={-0.1}
      />
      <netlabel
        net="TWO"
        connectsTo={".U2 > .pin2"}
        schRotation={90}
        schY={1}
        schX={0.1}
      />
      <netlabel
        net="THREE"
        connectsTo={".U2 > .pin3"}
        schRotation={90}
        schY={-1}
        schX={-0.1}
      />
      <netlabel
        net="FOUR"
        connectsTo={".U2 > .pin4"}
        schRotation={90}
        schY={-1}
        schX={0.1}
      />
      <netlabel
        net="FIVE"
        connectsTo={".U2 > .pin5"}
        schRotation={90}
        schX={-1}
        schY={0.1}
      />
      <netlabel
        net="SIX"
        connectsTo={".U2 > .pin6"}
        schRotation={90}
        schX={-1}
        schY={-0.1}
      />
      <netlabel
        net="SEVEN"
        connectsTo={".U2 > .pin7"}
        schRotation={90}
        schX={1}
        schY={0.1}
      />
      <netlabel
        net="EIGHT"
        connectsTo={".U2 > .pin8"}
        schRotation={90}
        schX={1}
        schY={-0.1}
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  Bun.write(
    "./debug-output/repro08-netlabel-rotation.kicad_sch",
    converter.getOutputString(),
  )

  const kicadSch: any = parseKicadSch(converter.getOutputString())
  const labels = new Map(
    (kicadSch.globalLabels ?? []).map((label: any) => [label.value, label]),
  )

  const assertLabel = (
    name: string,
    expected: {
      shape: string
      x: number
      y: number
      angle: number
      horizontal?: "left" | "right"
      vertical?: "top" | "bottom"
    },
  ) => {
    const label = labels.get(name)
    expect(label).toBeDefined()
    expect(label.shape).toBe(expected.shape)
    expect(label.at.x).toBe(expected.x)
    expect(label.at.y).toBe(expected.y)
    expect(label.at.angle).toBe(expected.angle)
    expect(label.effects?.justify?.horizontal).toBe(expected.horizontal)
    expect(label.effects?.justify?.vertical).toBe(expected.vertical)
  }

  // Assert all 4 sides explicitly so position/orientation regressions are caught
  assertLabel("ONE", {
    shape: "input",
    x: 147,
    y: 90,
    angle: 90,
    horizontal: "left",
  })
  assertLabel("TWO", {
    shape: "input",
    x: 150,
    y: 90,
    angle: 90,
    horizontal: "left",
  })
  assertLabel("THREE", {
    shape: "input",
    x: 147,
    y: 120,
    angle: 270,
    horizontal: "right",
  })
  assertLabel("FOUR", {
    shape: "input",
    x: 150,
    y: 120,
    angle: 270,
    horizontal: "right",
  })
  assertLabel("FIVE", {
    shape: "input",
    x: 133.5,
    y: 103.5,
    angle: 180,
    horizontal: "right",
  })
  assertLabel("SIX", {
    shape: "input",
    x: 133.5,
    y: 106.5,
    angle: 180,
    horizontal: "right",
  })
  assertLabel("SEVEN", {
    shape: "input",
    x: 163.5,
    y: 103.5,
    angle: 180,
    horizontal: "right",
  })
  assertLabel("EIGHT", {
    shape: "input",
    x: 163.5,
    y: 106.5,
    angle: 180,
    horizontal: "right",
  })

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})

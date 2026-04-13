import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
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

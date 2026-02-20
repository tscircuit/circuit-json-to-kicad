import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

/**
 * Pin on BOTTOM of symbol should have angle=90
 *
 * Symbol layout:
 *     [  O  ]
 *        |
 *        o  ← wire connects here
 *
 * Pin line extends DOWN from symbol, angle=90
 */
test("custom-symbol10: pin on BOTTOM has angle 90", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <chip
        name="U1"
        footprint="0402"
        symbol={
          <symbol>
            <schematiccircle
              center={{ x: 0, y: 0 }}
              radius={2}
              isFilled={true}
              fillColor="#ff44ff"
              strokeWidth={0.2}
            />
            {/* Line extending DOWN to port */}
            <schematicline x1={0} y1={-2} x2={0} y2={-5} strokeWidth={0.08} />
            {/* Port on BOTTOM - should have angle 90 */}
            <port name="B" pinNumber={1} direction="down" schX={0} schY={-5} />
          </symbol>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson() as any[]

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const kicadOutput = converter.getOutputString()

  // Verify pin has angle 90
  const pinMatch = kicadOutput.match(
    /\(pin passive line\s*\(at ([\d.-]+) ([\d.-]+) (\d+)\)/,
  )
  expect(pinMatch).not.toBeNull()
  expect(pinMatch![3]).toBe("90")

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: kicadOutput,
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson: circuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})

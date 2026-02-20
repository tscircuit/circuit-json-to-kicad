import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

/**
 * Pin on RIGHT side of symbol should have angle=180
 *
 * Symbol layout:
 *   [  O  ]──o
 *            ↑ wire connects here
 *
 * Pin line extends RIGHT from symbol, angle=180
 */
test("custom-symbol07: pin on RIGHT side has angle 180", async () => {
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
              fillColor="#4488ff"
              strokeWidth={0.2}
            />
            {/* Line extending RIGHT to port */}
            <schematicline x1={2} y1={0} x2={5} y2={0} strokeWidth={0.08} />

            {/* Port on RIGHT side - should have angle 180 */}
            <port name="R" pinNumber={1} direction="right" schX={5} schY={0} />
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

  // Verify pin has angle 180
  const pinMatch = kicadOutput.match(
    /\(pin passive line\s*\(at ([\d.-]+) ([\d.-]+) (\d+)\)/,
  )
  expect(pinMatch).not.toBeNull()
  expect(pinMatch![3]).toBe("180")

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

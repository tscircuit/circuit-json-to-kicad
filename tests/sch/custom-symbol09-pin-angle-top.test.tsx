import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

/**
 * Pin on TOP of symbol should have angle=270
 *
 * Symbol layout:
 *        o  ← wire connects here
 *        |
 *     [  O  ]
 *
 * Pin line extends UP from symbol, angle=270
 */
test("custom-symbol09: pin on TOP has angle 270", async () => {
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
              fillColor="#44ff88"
              strokeWidth={0.2}
            />
            {/* Line extending UP to port */}
            <schematicline x1={0} y1={2} x2={0} y2={5} strokeWidth={0.08} />
            {/* Port on TOP - should have angle 270 */}
            <port name="T" pinNumber={1} direction="up" schX={0} schY={5} />
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

  // Verify pin has angle 270
  const pinMatch = kicadOutput.match(
    /\(pin passive line\s*\(at ([\d.-]+) ([\d.-]+) (\d+)\)/,
  )
  expect(pinMatch).not.toBeNull()
  expect(pinMatch![3]).toBe("270")

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

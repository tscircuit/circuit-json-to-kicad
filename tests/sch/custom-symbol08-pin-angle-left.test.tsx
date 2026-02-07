import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

/**
 * Pin on LEFT side of symbol should have angle=0
 *
 * Symbol layout:
 *   o──[  O  ]
 *   ↑ wire connects here
 *
 * Pin line extends LEFT from symbol, angle=0
 */
test("custom-symbol08: pin on LEFT side has angle 0", async () => {
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
              radius={0.3}
              isFilled={true}
              fillColor="#ff8844"
            />
            {/* Line extending LEFT to port */}
            <schematicline
              x1={-0.3}
              y1={0}
              x2={-0.8}
              y2={0}
              strokeWidth={0.05}
            />
            {/* Port on LEFT side - should have angle 0 */}
            <port
              name="L"
              pinNumber={1}
              direction="left"
              schX={-0.8}
              schY={0}
            />
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

  // Verify pin has angle 0
  const pinMatch = kicadOutput.match(
    /\(pin passive line\s*\(at ([\d.-]+) ([\d.-]+) (\d+)\)/,
  )
  expect(pinMatch).not.toBeNull()
  expect(pinMatch![3]).toBe("0")

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

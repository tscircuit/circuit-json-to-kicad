import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

/**
 * This test verifies that isFilled and fillColor properties work correctly
 * for custom symbols.
 */
test("custom-symbol05: filled path with isFilled=true", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <capacitor
        name="C1"
        capacitance="10uF"
        footprint="0402"
        symbol={
          <symbol width={10} height={3}>
            {/* Filled rectangle */}
            <schematicpath
              points={[
                { x: -0.5, y: -0.3 },
                { x: 0.5, y: -0.3 },
                { x: 0.5, y: 0.3 },
                { x: -0.5, y: 0.3 },
                { x: -0.5, y: -0.3 },
              ]}
              strokeWidth={0.05}
              isFilled={true}
              fillColor="#ff5500"
            />
            {/* Line extending to the ports */}
            <schematicline x1={-0.5} y1={0} x2={-1} y2={0} strokeWidth={0.05} />
            <schematicline x1={0.5} y1={0} x2={1} y2={0} strokeWidth={0.05} />
            <port name="pos" direction="left" schX={-7} schY={0} />
            <port name="neg" direction="right" schX={7} schY={0} />
          </symbol>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]

  // Debug: write circuit json to see if is_filled is present
  await Bun.write(
    "./debug-output/custom-symbol05-filled-circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  // Find schematic_path elements and verify is_filled is set
  const schematicPaths = circuitJson.filter(
    (el: any) => el.type === "schematic_path",
  )
  expect(schematicPaths.length).toBeGreaterThan(0)

  // Check that at least one path has is_filled=true
  const filledPath = schematicPaths.find((p: any) => p.is_filled === true)
  expect(filledPath).toBeDefined()

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const kicadOutput = converter.getOutputString()
  await Bun.write(
    "./debug-output/custom-symbol05-filled.kicad_sch",
    kicadOutput,
  )

  // Verify the output contains "(fill (type background))" for the filled shape
  expect(kicadOutput).toContain("(fill")
  expect(kicadOutput).toContain("(type background)")

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

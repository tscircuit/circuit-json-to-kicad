import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

/**
 * This test demonstrates schStemLength support for custom symbols.
 * schStemLength generates schematic_line elements that extend from
 * the port toward the symbol body.
 */
test("stem-length01: custom symbol with schStemLength (snapshot)", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="10mm" height="10mm">
      <chip
        name="U1"
        footprint="soic8"
        symbol={
          <symbol width={10} height={10}>
            {/* Op-amp triangle */}
            <schematicline
              x1={-0.5}
              y1={-0.7}
              x2={-0.5}
              y2={0.7}
              strokeWidth={0.08}
            />
            <schematicline
              x1={-0.5}
              y1={0.7}
              x2={0.7}
              y2={0}
              strokeWidth={0.08}
            />
            <schematicline
              x1={0.7}
              y1={0}
              x2={-0.5}
              y2={-0.7}
              strokeWidth={0.08}
            />
            {/* Plus/minus labels */}
            <schematictext
              schX={-0.35}
              schY={0.35}
              text="+"
              fontSize={0.8}
              color="brown"
            />
            <schematictext
              schX={-0.35}
              schY={-0.35}
              text="-"
              fontSize={0.8}
              color="brown"
            />
            {/* Ports with custom stem lengths */}
            <port
              name="IN1"
              schX={-3.5}
              schY={0.35}
              direction="left"
              schStemLength={3}
            />
            <port
              name="IN2"
              schX={-3.5}
              schY={-0.35}
              direction="left"
              schStemLength={3}
            />
            <port
              name="OUT"
              schX={3.5}
              schY={0}
              direction="right"
              schStemLength={2.8}
            />
          </symbol>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]

  // Write debug output
  await Bun.write(
    "./debug-output/stem-length-circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const kicadOutput = converter.getOutputString()
  await Bun.write("./debug-output/stem-length.kicad_sch", kicadOutput)

  // Verify stem lines are in the output
  const kicadSch = converter.getOutput()
  const libSymbols = kicadSch.libSymbols?.symbols || []
  expect(libSymbols.length).toBeGreaterThan(0)

  const customSymbol = libSymbols[0]
  expect(customSymbol).toBeDefined()

  // The drawing subsymbol should contain polylines for both symbol body and stem lines
  const drawingSubsymbol = customSymbol?.subSymbols?.find((s: any) =>
    s.libraryId?.includes("_0_1"),
  )
  expect(drawingSubsymbol).toBeDefined()

  // Should have 6 polylines: 3 for symbol body + 3 for stem lines
  const polylineCount = drawingSubsymbol?.polylines?.length || 0
  expect(polylineCount).toBe(6)

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

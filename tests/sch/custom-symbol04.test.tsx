import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

/**
 * This test demonstrates custom symbol support using tscircuit's native
 * schematic symbol generation (no manual circuit JSON injection needed).
 */
test("custom-symbol04: NPN transistor with custom symbol (snapshot)", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <chip
        name="Q1"
        footprint="sot23"
        symbol={
          <symbol width={15} height={15}>
            {/* Outer circle */}
            <schematiccircle
              center={{ x: 0.1, y: 0 }}
              radius={0.55}
              isFilled={false}
              strokeWidth={0.08}
            />
            {/* Base vertical bar */}
            <schematicline
              x1={-0.1}
              y1={-0.5}
              x2={-0.1}
              y2={0.5}
              strokeWidth={0.08}
            />
            {/* Base input line */}
            <schematicline
              x1={-0.7}
              y1={0}
              x2={-0.1}
              y2={0}
              strokeWidth={0.08}
            />
            {/* Collector line (diagonal then vertical) */}
            <schematicline
              x1={-0.1}
              y1={0.2}
              x2={0.35}
              y2={0.5}
              strokeWidth={0.08}
            />
            <schematicline
              x1={0.35}
              y1={0.5}
              x2={0.35}
              y2={1}
              strokeWidth={0.08}
            />
            {/* Emitter line (diagonal then vertical) */}
            <schematicline
              x1={-0.1}
              y1={-0.2}
              x2={0.35}
              y2={-0.5}
              strokeWidth={0.08}
            />
            <schematicline
              x1={0.35}
              y1={-0.5}
              x2={0.35}
              y2={-1}
              strokeWidth={0.08}
            />
            {/* Emitter arrow (V shape pointing outward along emitter line) */}
            <schematicpath
              points={[
                { x: 0.16, y: -0.25 },
                { x: 0.2, y: -0.4 },
                { x: 0.06, y: -0.44 },
              ]}
              strokeWidth={0.08}
            />
            {/* Ports with stems replacing lead wire lines */}
            <port
              name="B"
              direction="left"
              schX={-1.3}
              schY={0}
              schStemLength={0.6}
            />
            <port
              name="C"
              direction="up"
              schX={0.35}
              schY={1.5}
              schStemLength={0.5}
            />
            <port
              name="E"
              direction="down"
              schX={0.35}
              schY={-1.5}
              schStemLength={0.5}
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
    "./debug-output/custom-symbol-circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const kicadOutput = converter.getOutputString()
  await Bun.write("./debug-output/custom-symbol.kicad_sch", kicadOutput)

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

import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("kicad-scale-factor01 custom BJT-style symbol with mixed components", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="10mm" height="10mm">
      <chip
        name="Q1"
        footprint="soic8"
        schX={0}
        schY={0}
        pinLabels={{
          pin1: "B",
          pin2: "C",
          pin3: "E",
        }}
        symbol={
          <symbol width={3} height={3}>
            {/* Outer circle */}
            <schematiccircle
              center={{ x: 0.1, y: 0 }}
              radius={0.55}
              isFilled={false}
              strokeWidth={0.05}
            />
            {/* Base vertical bar */}
            <schematicline
              x1={-0.1}
              y1={-0.5}
              x2={-0.1}
              y2={0.5}
              strokeWidth={0.05}
            />
            {/* Base input line */}
            <schematicline
              x1={-0.7}
              y1={0}
              x2={-0.1}
              y2={0}
              strokeWidth={0.05}
            />
            {/* Collector line (diagonal then vertical) */}
            <schematicline
              x1={-0.1}
              y1={0.2}
              x2={0.35}
              y2={0.5}
              strokeWidth={0.05}
            />
            <schematicline
              x1={0.35}
              y1={0.5}
              x2={0.35}
              y2={1}
              strokeWidth={0.05}
            />
            {/* Emitter line (diagonal then vertical) */}
            <schematicline
              x1={-0.1}
              y1={-0.2}
              x2={0.35}
              y2={-0.5}
              strokeWidth={0.05}
            />
            <schematicline
              x1={0.35}
              y1={-0.5}
              x2={0.35}
              y2={-1}
              strokeWidth={0.05}
            />
            {/* Emitter arrow (V shape pointing outward along emitter line) */}
            <schematicpath
              strokeWidth={0.05}
              points={[
                { x: 0.16, y: -0.25 },
                { x: 0.2, y: -0.4 },
                { x: 0.06, y: -0.44 },
              ]}
            />
            {/* Ports */}
            <port
              name="B"
              pinNumber={1}
              direction="left"
              schX={-0.7}
              schY={0}
            />
            <port name="C" pinNumber={2} direction="up" schX={0.35} schY={1} />
            <port
              name="E"
              pinNumber={3}
              direction="down"
              schX={0.35}
              schY={-1}
            />
          </symbol>
        }
      />

      <resistor
        name="R1"
        resistance="10k"
        footprint="0402"
        schX={-7}
        schY={0}
        connections={{ pin2: "Q1.B" }}
      />

      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        schX={4}
        schY={-6}
        connections={{ pin1: "Q1.E" }}
      />

      <chip
        name="U2"
        footprint="soic8"
        schX={7}
        schY={5}
        pinLabels={{
          pin1: "A",
          pin2: "B",
          pin3: "VCC",
          pin4: "GND",
        }}
        connections={{
          pin1: "Q1.C",
        }}
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson() as any

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const kicadOutput = converter.getOutputString()
  await Bun.write(
    "./debug-output/kicad-scale-factor01-custom-bjt-network.kicad_sch",
    kicadOutput,
  )

  expect(kicadOutput).toContain('(property "Reference" "Q1"')
  expect(kicadOutput).toContain('(property "Reference" "R1"')
  expect(kicadOutput).toContain('(property "Reference" "C1"')
  expect(kicadOutput).toContain('(property "Reference" "U2"')
  expect(kicadOutput).toContain("(wire")

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: kicadOutput,
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
}, 20_000)

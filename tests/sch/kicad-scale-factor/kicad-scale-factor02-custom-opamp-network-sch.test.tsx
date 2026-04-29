import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("kicad-scale-factor02 custom opamp symbol with mixed components", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="U1"
        footprint="soic8"
        pcbX={0}
        pcbY={0}
        schX={0}
        schY={0}
        pinLabels={{
          pin1: "IN_POS",
          pin2: "IN_NEG",
          pin3: "OUT",
        }}
        connections={{
          pin1: "R1.pin2",
          pin2: "C1.pin1",
          pin3: "U2.A",
        }}
        symbol={
          <symbol width={4} height={3}>
            <schematictext schX={0} schY={1} text="{NAME}" fontSize={0.2} />
            <schematicline
              x1={-0.5}
              y1={-0.7}
              x2={-0.5}
              y2={0.7}
              strokeWidth={0.05}
            />
            <schematicline
              x1={-0.5}
              y1={0.7}
              x2={0.7}
              y2={0}
              strokeWidth={0.05}
            />
            <schematicline
              x1={0.7}
              y1={0}
              x2={-0.5}
              y2={-0.7}
              strokeWidth={0.05}
            />
            <schematictext schX={-0.35} schY={0.35} text="+" fontSize={0.3} />
            <schematictext schX={-0.35} schY={-0.35} text="-" fontSize={0.3} />
            <port
              name="IN_POS"
              pinNumber={1}
              schX={-1}
              schY={0.35}
              direction="left"
              schStemLength={0.5}
            />
            <port
              name="IN_NEG"
              pinNumber={2}
              schX={-1}
              schY={-0.35}
              direction="left"
              schStemLength={0.5}
            />
            <port
              name="OUT"
              pinNumber={3}
              schX={1.2}
              schY={0}
              direction="right"
              schStemLength={0.5}
            />
          </symbol>
        }
      />

      <resistor
        name="R1"
        resistance="10k"
        footprint="0402"
        schX={-8}
        schY={3}
        connections={{ pin2: "U1.IN_POS" }}
      />

      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        schX={-8}
        schY={-3}
        connections={{ pin1: "U1.IN_NEG" }}
      />

      <chip
        name="U2"
        footprint="soic8"
        schX={8}
        schY={0}
        pinLabels={{
          pin1: "A",
          pin2: "B",
          pin3: "VCC",
          pin4: "GND",
        }}
        connections={{
          pin1: "U1.OUT",
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
    "./debug-output/kicad-scale-factor02-custom-opamp-network.kicad_sch",
    kicadOutput,
  )

  expect(kicadOutput).toContain('(property "Reference" "R1"')
  expect(kicadOutput).toContain('(property "Reference" "C1"')
  expect(kicadOutput).toContain('(property "Reference" "U1"')
  expect(kicadOutput).toContain('(property "Reference" "U2"')
  expect(kicadOutput).toMatch(/\(lib_id "Custom:[^"]+"/)
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

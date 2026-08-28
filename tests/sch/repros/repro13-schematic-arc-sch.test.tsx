import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { stackSchematicCircuitJsonKicadPngs } from "../../fixtures/stackSchematicCircuitJsonKicadPngs"

test("repro13 schematic arc schematic", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <schematicarc
        center={{ x: 0, y: 0 }}
        radius={1}
        startAngleDegrees={0}
        endAngleDegrees={180}
        strokeWidth={0.05}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  await Bun.write(
    "./debug-output/repro13-schematic-arc-sch.circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()

  const output = converter.getOutputString()
  const parsedSchematic = parseKicadSch(output)
  expect(parsedSchematic.arcs).toHaveLength(1)
  expect(parsedSchematic.arcs[0]?.start?.toObject()).toEqual({
    x: 163.5,
    y: 105,
  })
  expect(parsedSchematic.arcs[0]?.mid?.toObject()).toEqual({
    x: 148.5,
    y: 90,
  })
  expect(parsedSchematic.arcs[0]?.end?.toObject()).toEqual({
    x: 133.5,
    y: 105,
  })
  await Bun.write("./debug-output/repro13-schematic-arc-sch.kicad_sch", output)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackSchematicCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson: circuitJson as any,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 10_000)

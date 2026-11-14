import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Xy } from "kicadts"
import { readSchematicErc } from "../fixtures/read-schematic-erc"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

test("duplicate slanted leads move together and remain attached to the unchanged body", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        noConnect={["pin1"]}
        symbol={
          <symbol>
            <schematiccircle center={{ x: 0.05, y: 0 }} radius={0.11} />
            <schematicline x1={-0.42} y1={-0.1} x2={0.05} y2={-0.11} />
            <schematicline x1={-0.42} y1={-0.1} x2={0.05} y2={-0.11} />
            <port
              name="1"
              pinNumber={1}
              direction="left"
              schX={-0.42}
              schY={-0.1}
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const units = converter.getOutput().libSymbols!.symbols[0]!.subSymbols
  const pin = units.flatMap((unit) => unit.pins)[0]!
  const leads = units.flatMap((unit) => unit.polylines)
  expect(leads).toHaveLength(2)
  for (const lead of leads) {
    const endpoint = lead.points!.points[0]!
    expect(endpoint).toBeInstanceOf(Xy)
    expect(endpoint).toMatchObject({ x: pin.at!.x, y: pin.at!.y })
  }
  expect(leads[0]!.points!.points[1]!.getString()).toBe(
    leads[1]!.points!.points[1]!.getString(),
  )
  expect(
    (await readSchematicErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  await expect(
    snapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)

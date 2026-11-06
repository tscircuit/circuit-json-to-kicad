import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { any_circuit_element } from "circuit-json"
import { parseKicadPcb, parseKicadSch } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { CircuitJsonToKicadModConverter } from "lib/footprint/CircuitJsonToKicadModConverter"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"

test("default chip metadata reaches schematic, PCB, and standalone libraries", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={10} height={10}>
      <chip name="U1" footprint="soic8" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const generatedCircuitJson = circuit.getCircuitJson()
  expect(
    generatedCircuitJson.filter(
      (element) => element.type === "schematic_symbol",
    ),
  ).toHaveLength(0)

  // Test the exporter boundary independently of the core/props release cycle.
  // This is the default-box output of the example in props#986.
  const circuitJson = generatedCircuitJson.map((element) =>
    any_circuit_element.parse({
      ...element,
      ...(element.type === "schematic_component"
        ? {
            metadata: {
              kicad_symbol: {
                properties: {
                  Max_Current_A: { value: "6.4", effects: { hide: true } },
                },
              },
            },
          }
        : element.type === "pcb_component"
          ? {
              metadata: {
                kicad_footprint: {
                  footprintName: "MyPart",
                  properties: {
                    Value: { value: "MyPart" },
                    Max_Current_A: { value: "6.4", hide: true },
                  },
                },
              },
            }
          : {}),
    }),
  )

  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  schConverter.runUntilFinished()
  const schematic = parseKicadSch(schConverter.getOutputString())
  const symbol = schematic.symbols[0]!
  expect(
    symbol.properties.find((property) => property.key === "Max_Current_A"),
  ).toMatchObject({ value: "6.4", effects: { hiddenText: true } })
  expect(
    schematic.libSymbols?.symbols[0]?.properties.find(
      (property) => property.key === "Max_Current_A",
    ),
  ).toMatchObject({ value: "6.4", effects: { hiddenText: true } })
  expect(
    symbol.properties.find((property) => property.key === "Reference")?.value,
  ).toBe("U1")

  const controlConverter = new CircuitJsonToKicadSchConverter(
    generatedCircuitJson,
  )
  controlConverter.runUntilFinished()
  const controlSchematic = parseKicadSch(controlConverter.getOutputString())
  expect(
    schematic.libSymbols?.symbols[0]?.subSymbols.map((unit) =>
      unit.getString(),
    ),
  ).toEqual(
    controlSchematic.libSymbols?.symbols[0]?.subSymbols.map((unit) =>
      unit.getString(),
    ),
  )

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const footprint = parseKicadPcb(pcbConverter.getOutputString()).footprints[0]!
  expect(
    footprint.properties.find((property) => property.key === "Max_Current_A"),
  ).toMatchObject({ value: "6.4", hidden: true })

  const modConverter = new CircuitJsonToKicadModConverter(circuitJson)
  modConverter.runUntilFinished()
  expect(modConverter.getOutputString()).toContain(
    '(property "Max_Current_A" "6.4"',
  )

  const libraryConverter = new KicadLibraryConverter({
    kicadLibraryName: "default-chip",
    entrypoint: "component.tsx",
    getExportsFromTsxFile: async () => ["MyPart"],
    buildFileToCircuitJson: async () => circuitJson,
  })
  await libraryConverter.run()
  const libraryFiles = libraryConverter.getOutput().kicadProjectFsMap
  expect(String(libraryFiles["symbols/tscircuit_builtin.kicad_sym"])).toContain(
    '(property "Max_Current_A" "6.4"',
  )
})

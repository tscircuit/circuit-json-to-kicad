import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { any_circuit_element, type CircuitJson } from "circuit-json"
import { KicadSymbolLib, parseKicadSch, parseKicadSexpr } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"

async function getCircuitJson({
  maxCurrents,
  customSymbol = false,
}: {
  maxCurrents: string[]
  customSymbol?: boolean
}): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width={40} height={10}>
      {maxCurrents.map((_, index) => (
        <chip
          key={index}
          name={`U${index + 1}`}
          footprint="soic8"
          schX={(index - (maxCurrents.length - 1) / 2) * 3}
          symbol={
            customSymbol ? (
              <symbol name="Shared">
                <schematicrect width={1} height={1} />
                <port name="pin1" direction="left" schX={-0.5} />
              </symbol>
            ) : undefined
          }
        />
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const sourceComponents = circuitJson.filter(
    (element) => element.type === "source_component",
  )
  return circuitJson.map((element) => {
    if (
      (!customSymbol && element.type === "schematic_component") ||
      (customSymbol && element.type === "schematic_symbol")
    ) {
      const maxCurrentA =
        element.type === "schematic_component"
          ? maxCurrents[
              sourceComponents.findIndex(
                (source) =>
                  source.source_component_id === element.source_component_id,
              )
            ]
          : maxCurrents[0]
      return any_circuit_element.parse({
        ...element,
        metadata: {
          kicad_symbol: {
            properties: { Max_Current_A: { value: maxCurrentA } },
          },
        },
      })
    }
    return any_circuit_element.parse(element)
  })
}

test("schematic deduplication distinguishes metadata and reuses identical definitions", async () => {
  const converter = new CircuitJsonToKicadSchConverter(
    await getCircuitJson({ maxCurrents: ["6.4", "2.1", "6.4"] }),
  )
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  const definitions = schematic.libSymbols!.symbols
  expect(definitions).toHaveLength(2)
  expect(schematic.symbols).toHaveLength(3)
  expect(schematic.symbols[0]!.libraryId).not.toBe(
    schematic.symbols[1]!.libraryId,
  )
  expect(schematic.symbols[0]!.libraryId).toBe(schematic.symbols[2]!.libraryId)
  for (const instance of schematic.symbols) {
    const definition = definitions.find(
      (symbol) => symbol.libraryId === instance.libraryId,
    )!
    expect(
      definition.properties.find((property) => property.key === "Max_Current_A")
        ?.value,
    ).toBe(
      instance.properties.find((property) => property.key === "Max_Current_A")
        ?.value,
    )
  }
})

test("standalone libraries retain distinct metadata across component exports", async () => {
  const circuitJsonByExport: Record<string, CircuitJson> = {
    DefaultHigh: await getCircuitJson({ maxCurrents: ["6.4"] }),
    DefaultLow: await getCircuitJson({ maxCurrents: ["2.1"] }),
    DefaultHighCopy: await getCircuitJson({ maxCurrents: ["6.4"] }),
    CustomHigh: await getCircuitJson({
      maxCurrents: ["6.4"],
      customSymbol: true,
    }),
    CustomLow: await getCircuitJson({
      maxCurrents: ["2.1"],
      customSymbol: true,
    }),
    CustomHighCopy: await getCircuitJson({
      maxCurrents: ["6.4"],
      customSymbol: true,
    }),
  }
  const converter = new KicadLibraryConverter({
    kicadLibraryName: "metadata",
    entrypoint: "components.tsx",
    getExportsFromTsxFile: async () => Object.keys(circuitJsonByExport),
    buildFileToCircuitJson: async (_file, name) =>
      circuitJsonByExport[name] ?? null,
  })
  await converter.run()
  const files = converter.getOutput().kicadProjectFsMap
  for (const filename of [
    "symbols/tscircuit_builtin.kicad_sym",
    "symbols/metadata.kicad_sym",
  ]) {
    const library = parseKicadSexpr(String(files[filename])).find(
      (node) => node instanceof KicadSymbolLib,
    )!
    expect(library.symbols).toHaveLength(2)
    expect(
      library.symbols
        .map(
          (symbol) =>
            symbol.properties.find(
              (property) => property.key === "Max_Current_A",
            )?.value,
        )
        .sort(),
    ).toEqual(["2.1", "6.4"])
  }
})

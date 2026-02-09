import { test, expect } from "bun:test"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"
import type { CircuitJson } from "circuit-json"
import path from "path"

const stepFilePath = path.resolve(
  __dirname,
  "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
)

// A shared symbol used by multiple connector variants
const ConnectorSymbol = () => (
  <symbol name="Connector">
    <schematicpath
      strokeWidth={0.05}
      points={[
        { x: -0.5, y: 0 },
        { x: 0.5, y: 0 },
      ]}
      isFilled={false}
    />
    <port name="1" pinNumber={1} direction="right" schX={1} schY={0} />
  </symbol>
)

// A shared symbol used by multiple switch variants
const SwitchSymbol = () => (
  <symbol name="Switch">
    <schematicpath
      strokeWidth={0.05}
      points={[
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ]}
      isFilled={false}
    />
    <port name="1" pinNumber={1} direction="right" schX={1.5} schY={0} />
  </symbol>
)

async function renderConnectorLarge(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="J1"
        symbol={<ConnectorSymbol />}
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width="3mm"
              height="3mm"
              portHints={["pin1"]}
              pcbX={0}
              pcbY={0}
            />
          </footprint>
        }
        cadModel={{
          stepUrl: stepFilePath,
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
        pinLabels={{ pin1: "1" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

async function renderConnectorSmall(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="J1"
        symbol={<ConnectorSymbol />}
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width="2mm"
              height="2mm"
              portHints={["pin1"]}
              pcbX={0}
              pcbY={0}
            />
          </footprint>
        }
        cadModel={{
          stepUrl: stepFilePath,
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
        pinLabels={{ pin1: "1" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

async function renderSwitchLarge(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="SW1"
        symbol={<SwitchSymbol />}
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width="4mm"
              height="1mm"
              portHints={["pin1"]}
              pcbX={0}
              pcbY={0}
            />
          </footprint>
        }
        cadModel={{
          stepUrl: stepFilePath,
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
        pinLabels={{ pin1: "1" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

async function renderSwitchSmall(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="SW1"
        symbol={<SwitchSymbol />}
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width="3mm"
              height="0.8mm"
              portHints={["pin1"]}
              pcbX={0}
              pcbY={0}
            />
          </footprint>
        }
        cadModel={{
          stepUrl: stepFilePath,
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
        pinLabels={{ pin1: "1" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

test("components sharing same symbol name result in single deduplicated symbol", async () => {
  const circuitJsonByComponent: Record<string, CircuitJson> = {
    ConnectorLarge: await renderConnectorLarge(),
    ConnectorSmall: await renderConnectorSmall(),
    SwitchLarge: await renderSwitchLarge(),
    SwitchSmall: await renderSwitchSmall(),
  }

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "my-library",
    entrypoint: "lib/index.ts",
    getExportsFromTsxFile: async () => Object.keys(circuitJsonByComponent),
    buildFileToCircuitJson: async (_file, name) =>
      circuitJsonByComponent[name] ?? null,
    includeBuiltins: false,
  })

  await converter.run()
  const output = converter.getOutput()

  // Should have 4 footprints (one per component variant)
  const footprintFiles = Object.keys(output.kicadProjectFsMap)
    .filter((k) => k.endsWith(".kicad_mod"))
    .sort()
  expect(footprintFiles).toEqual([
    "footprints/my-library.pretty/ConnectorLarge.kicad_mod",
    "footprints/my-library.pretty/ConnectorSmall.kicad_mod",
    "footprints/my-library.pretty/SwitchLarge.kicad_mod",
    "footprints/my-library.pretty/SwitchSmall.kicad_mod",
  ])

  // Get the symbol file content
  const symbolContent = output.kicadProjectFsMap[
    "symbols/my-library.kicad_sym"
  ] as string
  expect(symbolContent).toBeDefined()

  // Should have exactly 2 top-level symbols (deduplicated by name)
  const topLevelSymbols = symbolContent
    .match(/\(symbol "([^"_]+)"\n/g)
    ?.map((m: string) => m.match(/"([^"]+)"/)?.[1])
    .filter(Boolean) as string[]

  expect(topLevelSymbols.length).toBe(2)
  expect(topLevelSymbols.sort()).toEqual(["Connector", "Switch"])

  // Verify symbols have expected properties
  expect(symbolContent).toContain('(symbol "Connector"')
  expect(symbolContent).toContain('(symbol "Switch"')

  // Check that ki_fp_filters uses wildcard pattern for footprint matching
  expect(symbolContent).toContain('"ki_fp_filters" "Connector*"')
  expect(symbolContent).toContain('"ki_fp_filters" "Switch*"')

  // Verify footprints are linked correctly
  expect(symbolContent).toContain('"Footprint" "my-library:')
})

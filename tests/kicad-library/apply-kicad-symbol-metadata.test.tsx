import { test, expect } from "bun:test"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"
import type { CircuitJson } from "circuit-json"

const KeySocket = () => (
  <chip
    name="REF**"
    kicadSymbolMetadata={{
      pinNumbers: {
        hide: true,
      },
      pinNames: {
        hide: true,
        offset: 2.54,
      },
      properties: {
        Reference: {
          value: "SW",
        },
        Value: {
          value: "MX_SWITCH",
        },
        Description: {
          value: "Cherry MX switch symbol",
        },
      },
    }}
    symbol={
      <symbol name="KeySocket">
        <schematicpath
          strokeWidth={0.05}
          points={[
            { x: -0.3, y: -0.2 },
            { x: 0.3, y: -0.2 },
            { x: 0.3, y: 0.2 },
            { x: -0.3, y: 0.2 },
            { x: -0.3, y: -0.2 },
          ]}
        />
        <port name="pin1" direction="left" schX={-0.4} schY={0} />
        <port name="pin2" direction="right" schX={0.4} schY={0} />
      </symbol>
    }
    footprint={
      <footprint>
        <smtpad
          shape="rect"
          width="2.5mm"
          height="1.2mm"
          portHints={["pin1"]}
          pcbX={-3.81}
          pcbY={2.54}
        />
        <smtpad
          shape="rect"
          width="2.5mm"
          height="1.2mm"
          portHints={["pin2"]}
          pcbX={2.54}
          pcbY={5.08}
        />
        <hole pcbX={0} pcbY={0} diameter="4mm" />
        <silkscreentext text="SW" pcbY={8} fontSize="1mm" />
      </footprint>
    }
    cadModel={{
      stlUrl: "/path/to/CherryMxSwitch.step",
      rotationOffset: { x: 0, y: 0, z: 0 },
    }}
    pinLabels={{ pin1: "1", pin2: "2" }}
  />
)

const KeyHotSocket = () => (
  <board width="20mm" height="20mm">
    <KeySocket />
  </board>
)

async function renderKeyHotSocket(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(<KeyHotSocket />)
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

test("KicadLibraryConverter applies kicadSymbolMetadata", async () => {
  const mockExports: Record<string, string[]> = {
    "lib/my-keyboard-library.ts": ["KeyHotSocket"],
  }

  const mockCircuitJson: Record<string, CircuitJson> = {
    KeyHotSocket: await renderKeyHotSocket(),
  }

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "my-keyboard-library",
    entrypoint: "lib/my-keyboard-library.ts",
    getExportsFromTsxFile: async (filePath) => mockExports[filePath] ?? [],
    buildFileToCircuitJson: async (_filePath, componentName) =>
      mockCircuitJson[componentName] ?? null,
    includeBuiltins: true,
  })

  await converter.run()
  const output = converter.getOutput()

  const symbolsFile =
    output.kicadProjectFsMap["symbols/my-keyboard-library.kicad_sym"]
  expect(symbolsFile).toBeDefined()

  const symbolContents = String(symbolsFile)
  expect(symbolContents).toContain('(property "Reference" "SW"')
  expect(symbolContents).toContain('(property "Value" "MX_SWITCH"')
  expect(symbolContents).toContain(
    '(property "Description" "Cherry MX switch symbol"',
  )
  expect(symbolContents).toContain("(pin_numbers")
  expect(symbolContents).toContain("(hide yes)")
  expect(symbolContents).toContain("(pin_names")
  expect(symbolContents).toContain("(offset 2.54)")
})

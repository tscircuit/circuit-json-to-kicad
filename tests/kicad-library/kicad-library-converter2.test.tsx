import { test, expect } from "bun:test"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { Circuit } from "tscircuit"
import type { CircuitJson } from "circuit-json"
import path from "path"

const stepFilePath = path.resolve(
  __dirname,
  "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
)

// Mock component: UsbConnector - custom footprint with multiple pads
async function renderUsbConnector(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="15mm" height="10mm">
      <chip
        name="REF**"
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width="0.6mm"
              height="1.8mm"
              portHints={["pin1"]}
              pcbX={-1.25}
              pcbY={0}
            />
            <smtpad
              shape="rect"
              width="0.6mm"
              height="1.8mm"
              portHints={["pin2"]}
              pcbX={-0.625}
              pcbY={0}
            />
            <smtpad
              shape="rect"
              width="0.6mm"
              height="1.8mm"
              portHints={["pin3"]}
              pcbX={0}
              pcbY={0}
            />
            <smtpad
              shape="rect"
              width="0.6mm"
              height="1.8mm"
              portHints={["pin4"]}
              pcbX={0.625}
              pcbY={0}
            />
            <smtpad
              shape="rect"
              width="0.6mm"
              height="1.8mm"
              portHints={["pin5"]}
              pcbX={1.25}
              pcbY={0}
            />
            <silkscreentext text="USB" pcbY={3} fontSize="0.8mm" />
          </footprint>
        }
        cadModel={{
          stepUrl: stepFilePath,
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
        pinLabels={{
          pin1: "VBUS",
          pin2: "D-",
          pin3: "D+",
          pin4: "ID",
          pin5: "GND",
        }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

// Mock component: PowerRegulator - uses builtin footprint
async function renderPowerRegulator(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="15mm">
      <chip
        name="REF**"
        footprint="soic8"
        pinLabels={{ pin1: "IN", pin4: "GND", pin8: "OUT" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}

test("KicadLibraryConverter full output with custom USB connector", async () => {
  const mockExports: Record<string, string[]> = {
    "lib/usb-library.ts": ["UsbConnector", "PowerRegulator"],
  }

  const mockCircuitJson: Record<string, CircuitJson> = {
    UsbConnector: await renderUsbConnector(),
    PowerRegulator: await renderPowerRegulator(),
  }

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "usb-library",
    entrypoint: "lib/usb-library.ts",
    getExportsFromTsxFile: async (filePath) => mockExports[filePath] ?? [],
    buildFileToCircuitJson: async (_filePath, componentName) =>
      mockCircuitJson[componentName] ?? null,
    includeBuiltins: true,
  })

  await converter.run()
  const output = converter.getOutput()

  // Verify file structure includes 3dmodels
  const outputKeys = Object.keys(output.kicadProjectFsMap).sort()
  expect(outputKeys).toMatchInlineSnapshot(`
    [
      "footprints/tscircuit_builtin.pretty/chip_soic8.kicad_mod",
      "footprints/usb-library.pretty/UsbConnector.kicad_mod",
      "fp-lib-table",
      "sym-lib-table",
      "symbols/tscircuit_builtin.kicad_sym",
      "symbols/usb-library.kicad_sym",
    ]
  `)

  // Verify 3D model paths are collected
  expect(output.model3dSourcePaths.length).toBe(1)
})

import { test, expect } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import path from "node:path"
import { Circuit } from "tscircuit"

test("library export paths for prefixed and unprefixed custom footprint names", async () => {
  const footprintPathsByName: Record<string, string[]> = {}

  for (const footprintName of ["MyPart", "mylib:MyPart"]) {
    const circuit = new Circuit()
    circuit.add(
      <board width="20mm" height="10mm">
        <chip
          name="U1"
          pcbX={-3}
          schX={-3}
          pinLabels={{ pin1: "IN", pin2: "OUT" }}
          kicadFootprintMetadata={{ footprintName }}
          footprint={
            <footprint>
              <smtpad
                shape="rect"
                width="1mm"
                height="1mm"
                portHints={["pin1"]}
                pcbX={-1}
              />
              <smtpad
                shape="rect"
                width="1mm"
                height="1mm"
                portHints={["pin2"]}
                pcbX={1}
              />
            </footprint>
          }
          cadModel={{
            stepUrl: path.resolve(
              __dirname,
              "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
            ),
          }}
        />
        <resistor
          name="R1"
          resistance="1k"
          footprint="0402"
          pcbX={3}
          schX={3}
        />
      </board>,
    )
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson() as CircuitJson

    // The board export already preserves the metadata name, including its prefix.
    const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
    pcbConverter.runUntilFinished()
    expect(
      pcbConverter.getOutput().footprints.map((fp) => fp.libraryLink),
    ).toContain(footprintName)

    const converter = new KicadLibraryConverter({
      kicadLibraryName: "mylib",
      entrypoint: "lib/index.ts",
      getExportsFromTsxFile: async () => ["MyPart"],
      buildFileToCircuitJson: async () => circuitJson,
      includeBuiltins: true,
    })
    await converter.run()

    footprintPathsByName[footprintName] = Object.keys(
      converter.getOutput().kicadProjectFsMap,
    )
      .filter((filePath) => filePath.endsWith(".kicad_mod"))
      .sort()
  }

  // Issue #639: snapshot the destination, which a footprint image cannot show.
  expect(footprintPathsByName).toMatchInlineSnapshot(`
    {
      "MyPart": [
        "footprints/mylib.pretty/MyPart.kicad_mod",
        "footprints/tscircuit_builtin.pretty/resistor_res0402.kicad_mod",
      ],
      "mylib:MyPart": [
        "footprints/tscircuit_builtin.pretty/MyPart.kicad_mod",
        "footprints/tscircuit_builtin.pretty/resistor_res0402.kicad_mod",
      ],
    }
  `)
})

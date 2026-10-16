import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadLibraryConverter } from "lib/kicad-library/CircuitJsonToKicadLibraryConverter"
import { Footprint, parseKicadSym } from "kicadts"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("different anonymous inline footprints remain separate library entries", async () => {
  for (const withCustomSymbols of [false, true]) {
    const circuit = new Circuit()
    circuit.add(
      <board width={30} height={20}>
        <chip
          name="U1"
          symbol={
            withCustomSymbols ? (
              <symbol>
                <schematiccircle center={{ x: 0, y: 0 }} radius={1} />
              </symbol>
            ) : undefined
          }
          pcbX={-5}
          footprint={
            <footprint>
              <smtpad
                portHints={["pin1"]}
                shape="rect"
                width={1}
                height={1}
                pcbX={0}
                pcbY={0}
              />
            </footprint>
          }
        />
        <chip
          name="U2"
          symbol={
            withCustomSymbols ? (
              <symbol>
                <schematiccircle center={{ x: 0, y: 0 }} radius={2} />
              </symbol>
            ) : undefined
          }
          pcbX={5}
          footprint={
            <footprint>
              <smtpad
                portHints={["pin1"]}
                shape="rect"
                width={3}
                height={2}
                pcbX={0}
                pcbY={0}
              />
              <smtpad
                portHints={["pin2"]}
                shape="rect"
                width={1}
                height={1}
                pcbX={4}
                pcbY={0}
              />
            </footprint>
          }
        />
      </board>,
    )
    await circuit.renderUntilSettled()
    const input = circuit.getCircuitJson()
    expect(input.filter((e) => e.type === "pcb_component")).toHaveLength(2)
    const pcb = new CircuitJsonToKicadPcbConverter(input)
    pcb.runUntilFinished()
    expect(
      pcb
        .getOutput()
        .footprints.map((fp) => fp.fpPads.length)
        .sort(),
    ).toEqual([1, 2])
    const converter = new CircuitJsonToKicadLibraryConverter(input)
    converter.runUntilFinished()
    const entries = converter.getFootprints()
    const padCounts = entries
      .map(
        (entry) =>
          (Footprint.parse(entry.kicadModString)[0] as Footprint).fpPads.length,
      )
      .sort()
    expect(padCounts).toEqual([1, 2])
    expect(new Set(entries.map((entry) => entry.footprintName)).size).toBe(2)
    const refs = converter
      .getOutput()
      .symbols.map(
        ({ symbol }) =>
          symbol.properties.find((p) => p.key === "Footprint")?.value,
      )
    expect(new Set(refs)).toEqual(
      new Set(entries.map((entry) => `tscircuit:${entry.footprintName}`)),
    )
    for (const isPcm of [false, true]) {
      const library = new KicadLibraryConverter({
        kicadLibraryName: "test_lib",
        entrypoint: "lib/test_lib.ts",
        getExportsFromTsxFile: async () => ["Pair"],
        buildFileToCircuitJson: async () => input,
        includeBuiltins: true,
        isPcm,
        kicadPcmPackageId: "com.example.test",
      })
      await library.run()
      const files = library.getOutput().kicadProjectFsMap
      const footprintPaths = Object.keys(files).filter((p) =>
        p.endsWith(".kicad_mod"),
      )
      expect(footprintPaths).toHaveLength(2)
      const targets = Object.entries(files)
        .filter(([p]) => p.endsWith(".kicad_sym"))
        .flatMap(([, content]) =>
          parseKicadSym(content as string).symbols.map(
            (symbol) =>
              symbol.properties.find((p) => p.key === "Footprint")?.value,
          ),
        )
      expect(targets).toHaveLength(2)
      expect(new Set(targets).size).toBe(2)
      for (const target of targets) {
        const [libraryName, footprintName] = target!
          .replace(/^PCM_/, "")
          .split(":")
        expect(footprintPaths).toContain(
          `footprints/${libraryName}.pretty/${footprintName}.kicad_mod`,
        )
      }
    }
  }
})

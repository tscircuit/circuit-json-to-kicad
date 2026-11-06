import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadLibraryConverter } from "lib"
import { generateFpLibTable } from "lib/kicad-library/kicad-library-converter-utils/generateFpLibTable"
import { generateSymLibTable } from "lib/kicad-library/kicad-library-converter-utils/generateSymLibTable"

function fields(table: string, key: string): string[] {
  const pattern = new RegExp(`\\(${key}\\s+("(?:\\\\.|[^"\\\\])*")\\s*\\)`, "g")
  return [...table.matchAll(pattern)].map((match) => JSON.parse(match[1]!))
}

test("library tables preserve quoted names and URIs as single string fields", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={20} height={20}>
      <resistor name="R1" resistance="1k" footprint="0402" />
    </board>,
  )
  await circuit.renderUntilSettled()
  for (const name of ["example", "Lab A", 'Lab "A"', 'Lab "A" (rev 2)']) {
    const converter = new CircuitJsonToKicadLibraryConverter(
      circuit.getCircuitJson(),
      {
        libraryName: name,
        footprintLibraryName: name,
      },
    )
    converter.runUntilFinished()
    const output = converter.getOutput()
    for (const [table, extension] of [
      [output.fpLibTableString, ".pretty"],
      [output.symLibTableString, ".kicad_sym"],
    ]) {
      expect(fields(table!, "name")).toEqual([name])
      expect(fields(table!, "uri")).toEqual(["${KIPRJMOD}/" + name + extension])
    }
    for (const [generate, folder, extension] of [
      [generateFpLibTable, "footprints", ".pretty"],
      [generateSymLibTable, "symbols", ".kicad_sym"],
    ] as const) {
      const table = generate({
        kicadLibraryName: name,
        includeUser: true,
        includeBuiltin: true,
      })
      expect(fields(table, "name")).toEqual([name, "tscircuit_builtin"])
      expect(fields(table, "uri")).toEqual([
        "${KIPRJMOD}/" + folder + "/" + name + extension,
        "${KIPRJMOD}/" + folder + "/tscircuit_builtin" + extension,
      ])
      expect(
        fields(
          generate({
            kicadLibraryName: name,
            includeUser: false,
            includeBuiltin: true,
          }),
          "name",
        ),
      ).toEqual(["tscircuit_builtin"])
    }
  }
})

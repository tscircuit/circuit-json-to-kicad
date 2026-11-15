import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadLibraryConverter } from "lib"
import { generateFpLibTable } from "lib/kicad-library/kicad-library-converter-utils/generateFpLibTable"
import { generateSymLibTable } from "lib/kicad-library/kicad-library-converter-utils/generateSymLibTable"

test("library table strings escape quotes in library names", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={20} height={20}>
      <resistor name="R1" resistance="1k" footprint="0402" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadLibraryConverter(
    circuit.getCircuitJson(),
    {
      libraryName: 'Lab "A"',
      footprintLibraryName: 'Lab "A"',
    },
  )
  converter.runUntilFinished()
  const output = converter.getOutput()
  const quotedName = String.raw`(name "Lab \"A\"")`
  const quotedFpUri = '(uri "${KIPRJMOD}/Lab \\"A\\".pretty")'
  const quotedSymUri = '(uri "${KIPRJMOD}/Lab \\"A\\".kicad_sym")'
  expect(output.fpLibTableString).toContain(quotedName)
  expect(output.fpLibTableString).toContain(quotedFpUri)
  expect(output.symLibTableString).toContain(quotedName)
  expect(output.symLibTableString).toContain(quotedSymUri)

  const helperFpTable = generateFpLibTable({
    kicadLibraryName: 'Lab "A"',
    includeUser: true,
    includeBuiltin: false,
  })
  const helperSymTable = generateSymLibTable({
    kicadLibraryName: 'Lab "A"',
    includeUser: true,
    includeBuiltin: false,
  })
  expect(helperFpTable).toContain(quotedName)
  expect(helperFpTable).toContain(
    '(uri "${KIPRJMOD}/footprints/Lab \\"A\\".pretty")',
  )
  expect(helperSymTable).toContain(quotedName)
  expect(helperSymTable).toContain(
    '(uri "${KIPRJMOD}/symbols/Lab \\"A\\".kicad_sym")',
  )
})

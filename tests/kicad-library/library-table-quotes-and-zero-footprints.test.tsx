import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadLibraryConverter,
  CircuitJsonToKicadModConverter,
} from "lib"
import { generateFpLibTable } from "lib/kicad-library/kicad-library-converter-utils/generateFpLibTable"
import { generateSymLibTable } from "lib/kicad-library/kicad-library-converter-utils/generateSymLibTable"

test("library table strings escape quotes in library names (#533)", async () => {
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

  expect(
    generateFpLibTable({
      kicadLibraryName: 'Lab "A"',
      includeUser: true,
      includeBuiltin: false,
    }),
  ).toContain(quotedName)
  expect(
    generateSymLibTable({
      kicadLibraryName: 'Lab "A"',
      includeUser: true,
      includeBuiltin: false,
    }),
  ).toContain(quotedName)
})

test("CircuitJsonToKicadModConverter throws clear error when zero footprints are generated (#401)", () => {
  const converter = new CircuitJsonToKicadModConverter([])
  converter.runUntilFinished()

  expect(() => converter.getOutput()).toThrow(
    /No footprints were generated from the provided circuit JSON/,
  )
  expect(() => converter.getOutputString()).toThrow(
    /No footprints were generated from the provided circuit JSON/,
  )
  expect(() => converter.getModel3dSourcePaths()).toThrow(
    /No footprints were generated from the provided circuit JSON/,
  )

  const converterWithName = new CircuitJsonToKicadModConverter([], {
    footprintName: "res0402",
  })
  converterWithName.runUntilFinished()
  expect(() => converterWithName.getOutput()).toThrow(
    /No footprints were generated from the provided circuit JSON/,
  )
})

import { test, expect } from "bun:test"
import { testPcmBuild } from "../fixtures/testPcmBuild"

test("generatePcmAssets generates correct PCM directory structure", async () => {
  const { zipFsMap } = await testPcmBuild({
    fsMap: {
      "index.tsx": `
export const MyResistor = () => (
  <board width="10mm" height="10mm">
    <resistor name="R1" resistance="10k" footprint="0402" />
  </board>
)

export const MyCapacitor = () => (
  <board width="10mm" height="10mm">
    <capacitor name="C1" capacitance="100nF" footprint="0805" />
  </board>
)
`,
    },
  })

  expect(Object.keys(zipFsMap).sort()).toMatchInlineSnapshot(`
[
  "footprints/tscircuit_builtin.pretty/capacitor_0805.kicad_mod",
  "footprints/tscircuit_builtin.pretty/resistor_0402.kicad_mod",
  "metadata.json",
  "symbols/tscircuit_builtin.kicad_sym",
]
`)
})

import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

// A bottom-side component must be emitted on the back copper (layer "B.Cu") with
// its silk on B.SilkS, not left on F.Cu (which put it on the wrong CPL/silk side).
test("bottom-side component is emitted on B.Cu", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={0} pcbY={0} />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0402"
        layer="bottom"
        pcbX={3}
        pcbY={0}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pcb = converter.getOutputString()

  // split into footprint blocks and locate each part by its Reference property
  const blocks = pcb.split("(footprint").slice(1)
  const blockFor = (ref: string) =>
    blocks.find((b) => new RegExp(`"Reference"\\s+"${ref}"`).test(b))

  const top = blockFor("R1")
  const bottom = blockFor("R2")
  expect(top).toBeDefined()
  expect(bottom).toBeDefined()

  // footprint layer is the first (layer ...) in the block (unquoted)
  const fpLayer = (block: string) => block.match(/\(layer ([^)]+)\)/)?.[1]
  expect(fpLayer(top!)).toBe("F.Cu")
  expect(fpLayer(bottom!)).toBe("B.Cu")

  // every layer in the bottom part is a back layer; none left on the front
  const frontLayers = bottom!.match(/\(layers? (F\.[A-Za-z]+)/g)
  expect(frontLayers).toBeNull()
  expect(bottom!).toContain("B.Cu")
})

// Snapshot: the rendered board shows R1 on the front and R2 on the back copper.
test("bottom-side component renders on the back (snapshot)", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} pcbY={0} />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0402"
        layer="bottom"
        pcbX={2}
        pcbY={0}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})

import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

// Bottom-side components must sit on B.Cu with no leftover F.* layers
// (silk/fab/properties included). #412 set the footprint layer; this covers
// children that still arrive on F.* because circuit-json defaulted their layer.
test("bottom-side component is emitted on B.Cu", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={0} pcbY={0} />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0402"
        layer="bottom"
        pcbX={3}
        pcbY={0}
      />
      <pcbnotetext
        text="R2 = bottom layer (B.Cu)"
        fontSize={0.7}
        pcbX={0}
        pcbY={-3}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = converter.getOutputString()

  const blocks = pcb.split("(footprint").slice(1)
  const blockFor = (ref: string) =>
    blocks.find((b) => new RegExp(`"Reference"\\s+"${ref}"`).test(b))

  const top = blockFor("R1")
  const bottom = blockFor("R2")
  expect(top).toBeDefined()
  expect(bottom).toBeDefined()

  const fpLayer = (block: string) => block.match(/\(layer ([^)]+)\)/)?.[1]
  expect(fpLayer(top!)).toBe("F.Cu")
  expect(fpLayer(bottom!)).toBe("B.Cu")

  const frontLayers = bottom!.match(/\(layers? (F\.[A-Za-z]+)/g)
  expect(frontLayers).toBeNull()
  expect(bottom!).toContain("B.Cu")

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: pcb,
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
}, 31_000)

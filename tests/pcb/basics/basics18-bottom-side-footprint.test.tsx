import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

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
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
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
})

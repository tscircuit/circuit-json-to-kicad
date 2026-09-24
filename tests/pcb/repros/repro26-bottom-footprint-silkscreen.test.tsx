import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

// https://github.com/tscircuit/circuit-json-to-kicad/issues/362
test("bottom-side footprint silkscreen text is on B.SilkS and not dropped", async () => {
  const circuit = new Circuit()
  const FP = (
    <footprint>
      <smtpad
        portHints={["pin1"]}
        pcbX="-2mm"
        pcbY="0mm"
        width="1.6mm"
        height="2.6mm"
        shape="rect"
      />
      <smtpad
        portHints={["pin2"]}
        pcbX="2mm"
        pcbY="0mm"
        width="1.6mm"
        height="2.6mm"
        shape="rect"
      />
      <silkscreentext text="+" pcbX="-3.9mm" pcbY="0mm" fontSize="1mm" />
      <silkscreentext text="BT1" pcbX="0mm" pcbY="-2.3mm" fontSize="0.8mm" />
    </footprint>
  )

  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <chip name="BT1" footprint={FP} layer="bottom" pcbX={0} pcbY={0} />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pcb = converter.getOutputString()

  const blocks = pcb.split("(footprint").slice(1)
  const bt1 = blocks.find((b) => /"Reference"\s+"BT1"/.test(b))
  expect(bt1).toBeDefined()
  expect(bt1!).toContain("B.Cu")
  expect(bt1!).toContain("+")
  expect(bt1!).toContain("BT1")
  expect(bt1!).toContain("B.SilkS")
  expect(bt1!.match(/\(layers? (F\.[A-Za-z]+)/g)).toBeNull()
})

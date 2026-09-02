import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

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
  const bt1Block = blocks.find((b) => /"Reference"\s+"BT1"/.test(b))
  expect(bt1Block).toBeDefined()

  expect(bt1Block).toMatch(/\(layer B\.Cu\)/)
  expect(bt1Block).not.toMatch(/\(layer F\.SilkS\)/)

  const plusText = bt1Block!.match(
    /\(fp_text user "\+"[\s\S]*?\(layer ([^)]+)\)/,
  )
  expect(plusText).toBeDefined()
  expect(plusText![1]).toBe("B.SilkS")

  const labelText = bt1Block!.match(
    /\(fp_text user "BT1"[\s\S]*?\(layer ([^)]+)\)/,
  )
  expect(labelText).toBeDefined()
  expect(labelText![1]).toBe("B.SilkS")
})

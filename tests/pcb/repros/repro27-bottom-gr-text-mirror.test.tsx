import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

// https://github.com/tscircuit/circuit-json-to-kicad/issues/366
test("bottom standalone silkscreen gr_text includes justify mirror on B.SilkS", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <silkscreentext
        text="BOTTOM TEXT"
        layer="bottom"
        pcbX={0}
        pcbY={0}
        fontSize={1}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pcb = converter.getOutputString()

  expect(pcb).toMatch(
    /\(gr_text[\s\S]*?"BOTTOM TEXT"[\s\S]*?\(layer B\.SilkS\)[\s\S]*?\(justify[^)]*mirror/,
  )
})

import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"

test("PCB-only exports preserve existing trace display names", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0603" pcbX={-3} />
      <resistor name="R2" resistance="1k" footprint="0603" pcbX={3} />
      <trace from=".R1 > .pin2" to=".R2 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit
    .getCircuitJson()
    .filter((element) => !element.type.startsWith("schematic_"))
  const trace = circuitJson.find((element) => element.type === "source_trace")
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()
  expect(
    pcb.ctx.pcbNetMap?.get(trace!.subcircuit_connectivity_map_key!)?.name,
  ).toBe(trace!.display_name)
  expect(pcb.ctx.kicadPcb?.nets.length).toBe(2)
})

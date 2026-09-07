import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("pcb basics19 preserves copper pour clearance and legacy defaults", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="8mm" routingDisabled>
      <net name="GND" />
      <copperpour connectsTo="net.GND" layer="top" clearance="0.3mm" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const pours = circuitJson.filter(
    (element) => element.type === "pcb_copper_pour",
  )
  expect(pours.length).toBeGreaterThan(0)

  // The pinned tscircuit runtime predates copper-pour rule metadata. Add it to
  // the generated geometry to exercise the Circuit JSON converter boundary.
  for (const clearance of [0.3, 0, undefined]) {
    const input = circuitJson.map((element) => {
      if (element.type !== "pcb_copper_pour") return element
      const pour = { ...element }
      if (clearance === undefined) {
        delete pour.clearance
      } else {
        pour.clearance = clearance
      }
      return pour
    })
    const converter = new CircuitJsonToKicadPcbConverter(input)
    converter.runUntilFinished()
    const output = converter.getOutputString()
    const zones = parseKicadPcb(output).zones
    expect(zones).toHaveLength(pours.length)
    for (const zone of zones) {
      expect(zone.connectPads?.clearance).toBe(clearance ?? 0.15)
    }
  }
})

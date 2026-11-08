import { expect, test } from "bun:test"
import { parseKicadPcb, parseKicadSch } from "kicadts"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { Circuit } from "tscircuit"

test("unnamed passive trace derives KiCad default net name Net-(<Ref>-Pad<Pin>) in .kicad_pcb without polluting .kicad_sch labels", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="10k" footprint="0402" pcbX={-2} />
      <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={2} />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      <trace from=".R1 > .pin1" to="net.GND" />
      <trace from=".C1 > .pin2" to="net.GND" />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  schConverter.runUntilFinished()
  const sch = parseKicadSch(schConverter.getOutputString())

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const pcb = parseKicadPcb(pcbConverter.getOutputString())

  // Schematic should not emit synthetic visible labels on unnamed wire clusters
  expect(sch.labels ?? []).toHaveLength(0)

  // KiCad auto-names the unlabeled R1.pin2 <-> C1.pin1 net as Net-(C1-Pad1)
  // because "Net-(C1-Pad1)" < "Net-(R1-Pad2)" in code-unit order.
  const pcbNets = pcb.nets.filter((net) => net.id !== 0 && net.name !== "GND")
  expect(pcbNets).toHaveLength(1)
  expect(pcbNets[0]!.name).toBe("Net-(C1-Pad1)")

  // Verify the PCB pads on the unnamed net reference the matching net name
  const allPads = pcb.footprints.flatMap((fp) => fp.fpPads)
  const unnamedNetPads = allPads.filter(
    (pad) => pad.net?.name === "Net-(C1-Pad1)",
  )
  expect(unnamedNetPads).toHaveLength(2)
})

test("unnamed chip and passive traces match KiCad ResolveDrivers priority (named chip pin over -Pad pin, then ASCII order)", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <chip
        name="U1"
        footprint="soic8"
        pinLabels={{
          pin1: "VCC",
          pin2: "FB",
          pin3: "OUT",
          pin4: "GND",
        }}
      />
      <resistor name="R2" resistance="10k" footprint="0402" />
      <resistor name="R10" resistance="10k" footprint="0402" />
      <capacitor name="C3" capacitance="100nF" footprint="0402" />
      <trace from=".U1 > .FB" to=".R2 > .pin1" />
      <trace from=".R2 > .pin2" to=".R10 > .pin1" />
      <trace from=".R10 > .pin2" to=".C3 > .pin2" />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const pcb = parseKicadPcb(pcbConverter.getOutputString())

  const pcbNetNames = pcb.nets
    .filter((net) => net.id !== 0)
    .map((net) => net.name)
    .sort()

  // U1.FB <-> R2.pin1 -> Net-(U1-FB) (named pin beats -Pad pin)
  // R2.pin2 <-> R10.pin1 -> Net-(R10-Pad1) ("Net-(R10-Pad1)" < "Net-(R2-Pad2)")
  // R10.pin2 <-> C3.pin2 -> Net-(C3-Pad2) ("Net-(C3-Pad2)" < "Net-(R10-Pad2)")
  expect(pcbNetNames).toEqual([
    "Net-(C3-Pad2)",
    "Net-(R10-Pad1)",
    "Net-(U1-FB)",
  ])
})

test("fallback unnamed traces without component ports disambiguate colliding sanitized display names", () => {
  const syntheticCircuitJson: any[] = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 10,
      height: 10,
      thickness: 1.6,
      num_layers: 2,
    },
    {
      type: "source_trace",
      source_trace_id: "source_trace_0",
      connected_source_port_ids: [],
      connected_source_net_ids: [],
      display_name: "DATA/A",
      subcircuit_connectivity_map_key: "conn_net_0",
    },
    {
      type: "source_trace",
      source_trace_id: "source_trace_1",
      connected_source_port_ids: [],
      connected_source_net_ids: [],
      display_name: "DATA_A",
      subcircuit_connectivity_map_key: "conn_net_1",
    },
  ]

  const pcbConverter = new CircuitJsonToKicadPcbConverter(
    syntheticCircuitJson as any,
  )
  pcbConverter.runUntilFinished()
  const pcb = parseKicadPcb(pcbConverter.getOutputString())

  const pcbNetNames = pcb.nets
    .filter((net) => net.id !== 0)
    .map((net) => net.name)
    .sort()
  expect(pcbNetNames).toEqual(["DATA_A", "DATA_A_2"])
})

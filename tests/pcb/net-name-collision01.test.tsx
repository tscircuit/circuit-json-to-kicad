import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"

test("separate subcircuit nets retain distinct KiCad names", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      <net name="B_connectivity_net0/SIGNAL" />
      <net name="UNIQUE" />
      <group name="A" subcircuit pcbX={-5}>
        <net name="SIGNAL" />
        <resistor name="R1" resistance="1k" footprint="0402" />
        <resistor name="R3" resistance="1k" footprint="0402" pcbY={3} />
        <trace from=".R1 > .pin1" to="net.SIGNAL" />
        <trace from=".R3 > .pin1" to="net.SIGNAL" />
      </group>
      <group name="B" subcircuit pcbX={5}>
        <net name="SIGNAL" />
        <resistor name="R2" resistance="1k" footprint="0402" />
        <trace from=".R2 > .pin1" to="net.SIGNAL" />
      </group>
    </board>,
  )
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()
  const sourceNets = json.filter((e) => e.type === "source_net")
  const signals = sourceNets.filter((e) => e.name === "SIGNAL")
  expect(signals).toHaveLength(2)
  expect(
    new Set(signals.map((e) => e.subcircuit_connectivity_map_key)).size,
  ).toBe(2)
  const pcb = new CircuitJsonToKicadPcbConverter(json)
  pcb.runUntilFinished()
  const nets = pcb.getOutput().nets.filter((net) => net.id !== 0)
  expect(nets).toHaveLength(sourceNets.length)
  expect(new Set(nets.map((net) => net.name)).size).toBe(nets.length)
  expect(nets.some((net) => net.name === "B_connectivity_net0/SIGNAL")).toBe(
    true,
  )
  expect(nets.some((net) => net.name === "UNIQUE")).toBe(true)
  const mappedSignals = signals.map(
    (source) =>
      pcb.ctx.pcbNetMap!.get(source.subcircuit_connectivity_map_key!)!,
  )
  expect(mappedSignals[0]!.name).not.toBe(mappedSignals[1]!.name)
  const padNets = pcb
    .getOutput()
    .footprints.flatMap((fp) => fp.fpPads)
    .map((pad) => pad.net)
    .filter(Boolean)
  expect(
    padNets.filter((padNet) =>
      mappedSignals.some((net) => net.id === padNet!.id),
    ),
  ).toHaveLength(3)
  for (const net of mappedSignals) {
    expect(
      padNets.some(
        (padNet) => padNet!.id === net.id && padNet!.name === net.name,
      ),
    ).toBe(true)
    expect(pcb.getOutputString()).toContain(`(net ${net.id} "${net.name}")`)
  }
  const repeated = new CircuitJsonToKicadPcbConverter(json)
  repeated.runUntilFinished()
  expect(repeated.getOutput().nets.map((net) => [net.id, net.name])).toEqual(
    pcb.getOutput().nets.map((net) => [net.id, net.name]),
  )
})

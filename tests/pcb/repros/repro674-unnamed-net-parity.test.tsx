import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"

test.failing("repro674: PCB nets match the unlabeled schematic", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0603" pcbX={-3} />
      <capacitor name="C1" capacitance="100nF" footprint="0603" pcbX={3} />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const schematic = new CircuitJsonToKicadSchConverter(circuitJson)
  schematic.runUntilFinished()
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()
  await Bun.write(
    "./debug-output/repro674.kicad_sch",
    schematic.getOutputString(),
  )
  await Bun.write("./debug-output/repro674.kicad_pcb", pcb.getOutputString())

  expect(schematic.getOutput().labels).toHaveLength(0)
  expect(schematic.getOutput().globalLabels).toHaveLength(0)
  const nativeNets = await exportNativeSchematicNets(circuitJson)
  expect(nativeNets).toEqual([
    { name: "Net-(C1-Pad1)", pins: ["C1.1", "R1.2"] },
    { name: "unconnected-(C1-Pad2)", pins: ["C1.2"] },
    { name: "unconnected-(R1-Pad1)", pins: ["R1.1"] },
  ])

  const pcbPins = pcb.getOutput().footprints.flatMap((footprint) => {
    const reference = footprint.properties.find(
      (p) => p.key === "Reference",
    )!.value
    return footprint.fpPads.map((pad) => [
      `${reference}.${pad.number}`,
      pad.net?.name,
    ])
  })
  const schematicPins = nativeNets.flatMap((net) =>
    net.pins.map((pin) => [pin, net.name]),
  )
  expect(pcbPins.sort()).toEqual(schematicPins.sort())
}, 30_000)

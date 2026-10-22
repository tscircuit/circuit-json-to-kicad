import { beforeAll, expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"

let schematic: CircuitJsonToKicadSchConverter
let pcb: CircuitJsonToKicadPcbConverter
let nativeNets: Awaited<ReturnType<typeof exportNativeSchematicNets>>

beforeAll(async () => {
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
  schematic = new CircuitJsonToKicadSchConverter(circuitJson)
  schematic.runUntilFinished()
  pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()
  nativeNets = await exportNativeSchematicNets(circuitJson)
  await Bun.write(
    "./debug-output/repro674.kicad_sch",
    schematic.getOutputString(),
  )
  await Bun.write("./debug-output/repro674.kicad_pcb", pcb.getOutputString())
}, 30_000)

test("repro674: KiCad names the wire and unused pins without labels", () => {
  expect(schematic.getOutput().labels).toHaveLength(0)
  expect(schematic.getOutput().globalLabels).toHaveLength(0)
  expect(nativeNets).toEqual([
    { name: "Net-(C1-Pad1)", pins: ["C1.1", "R1.2"] },
    { name: "unconnected-(C1-Pad2)", pins: ["C1.2"] },
    { name: "unconnected-(R1-Pad1)", pins: ["R1.1"] },
  ])
})

function getPadNetName(reference: string, number: string) {
  const footprint = pcb
    .getOutput()
    .footprints.find((footprint) =>
      footprint.properties.some(
        (property) =>
          property.key === "Reference" && property.value === reference,
      ),
    )!
  return footprint.fpPads.find((pad) => pad.number === number)!.net?.name
}

// #674: the PCB currently uses source_trace.display_name for this net.
test.failing("repro674: connected pads use the schematic's automatic net name", () => {
  const expected = nativeNets.find((net) => net.pins.includes("R1.2"))!.name
  expect(getPadNetName("R1", "2")).toBe(expected)
  expect(getPadNetName("C1", "1")).toBe(expected)
})

// #674: the PCB currently leaves unused pads on net 0.
test.failing("repro674: unused pads use the schematic's unconnected net names", () => {
  for (const [reference, number] of [
    ["R1", "1"],
    ["C1", "2"],
  ]) {
    const expected = nativeNets.find((net) =>
      net.pins.includes(`${reference}.${number}`),
    )!.name
    expect(getPadNetName(reference!, number!)).toBe(expected)
  }
})

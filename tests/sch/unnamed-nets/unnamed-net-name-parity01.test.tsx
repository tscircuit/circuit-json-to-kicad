import { expect, test } from "bun:test"
import { parseKicadPcb, parseKicadSch } from "kicadts"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { Circuit } from "tscircuit"

test("unnamed nets get matching resolved net names in .kicad_sch and .kicad_pcb", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="10k" footprint="0402" pcbX={-2} />
      <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={2} />
      <trace from=".R1 > .pin1" to=".C1 > .pin1" />
      <trace from=".R1 > .pin2" to="net.GND" />
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

  // The unnamed trace (R1.pin1 -> C1.pin1) should have a hidden local label on the schematic
  const schLabels = sch.labels ?? []
  expect(schLabels.length).toBeGreaterThanOrEqual(1)
  const unnamedSchLabel = schLabels.find((label) => label.value !== "GND")
  expect(unnamedSchLabel).toBeDefined()
  expect(unnamedSchLabel!.value).toBe("R1_.pin1_to_.C1_.pin1")
  expect(unnamedSchLabel!.effects?.hiddenText).toBe(true)

  // In KiCad, a local label on the root sheet resolves to `/<label.value>`,
  // so the PCB net name must match `/<label.value>` for `--schematic-parity` DRC.
  const pcbNets = pcb.nets.filter((net) => net.id !== 0 && net.name !== "GND")
  expect(pcbNets).toHaveLength(1)
  expect(pcbNets[0]!.name).toBe(`/${unnamedSchLabel!.value}`)

  // Verify the schematic label is anchored at one of the schematic wire endpoints
  const wireEndpoints = (sch.wires ?? []).flatMap((wire) => {
    const pts = wire.points?.points ?? []
    return pts.map((pt: any) => ({ x: pt.x, y: pt.y }))
  })
  const labelPos = { x: unnamedSchLabel!.at?.x, y: unnamedSchLabel!.at?.y }
  const matchesEndpoint = wireEndpoints.some(
    (ep) =>
      Math.abs(ep.x - (labelPos.x ?? 0)) < 0.01 &&
      Math.abs(ep.y - (labelPos.y ?? 0)) < 0.01,
  )
  expect(matchesEndpoint).toBe(true)

  // Verify the PCB pads on the unnamed net reference the matching net name
  const allPads = pcb.footprints.flatMap((fp) => fp.fpPads)
  const unnamedNetPads = allPads.filter(
    (pad) => pad.net?.name === pcbNets[0]!.name,
  )
  expect(unnamedNetPads).toHaveLength(2)
})

test("unnamed traces with colliding sanitized display names are disambiguated across connectivity keys", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="14mm" height="10mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0402" schX={-3} schY={2} />
      <resistor name="R2" resistance="1k" footprint="0402" schX={3} schY={2} />
      <resistor
        name="R3"
        resistance="1k"
        footprint="0402"
        schX={-3}
        schY={-2}
      />
      <resistor name="R4" resistance="1k" footprint="0402" schX={3} schY={-2} />
      <trace from=".R1 > .pin2" to=".R2 > .pin1" />
      <trace from=".R3 > .pin2" to=".R4 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const sourceTraces = circuitJson.filter((el) => el.type === "source_trace")
  expect(sourceTraces).toHaveLength(2)
  sourceTraces[0]!.display_name = "DATA/A"
  sourceTraces[1]!.display_name = "DATA_A"

  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  schConverter.runUntilFinished()
  const sch = parseKicadSch(schConverter.getOutputString())

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const pcb = parseKicadPcb(pcbConverter.getOutputString())

  const schLabelNames = (sch.labels ?? []).map((l) => l.value).sort()
  expect(schLabelNames).toEqual(["DATA_A", "DATA_A_2"])

  const pcbNetNames = pcb.nets
    .filter((net) => net.id !== 0)
    .map((net) => net.name)
    .sort()
  expect(pcbNetNames).toEqual(["/DATA_A", "/DATA_A_2"])
})

test("hierarchical child-sheet unnamed traces include the sheet path in .kicad_pcb", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <schematicsheet name="First" displayName="First" />
      <group subcircuit name="First" schSheetName="First">
        <resistor name="R1" resistance="1k" footprint="0402" schX={-1.5} />
        <resistor name="R2" resistance="1k" footprint="0402" schX={1.5} />
        <trace from=".R1 > .pin2" to=".R2 > .pin1" />
      </group>
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  const schFiles = schConverter.getOutputFiles({
    schematicFilename: "root.kicad_sch",
  })
  const childSchFile = schFiles.find(
    (file) => file.filename !== "root.kicad_sch",
  )!
  const childSch = parseKicadSch(childSchFile.content)

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const pcb = parseKicadPcb(pcbConverter.getOutputString())

  expect(childSch.labels?.map((l) => l.value)).toEqual([
    "R1_.pin2_to_.R2_.pin1",
  ])
  expect(
    pcb.nets.filter((net) => net.id !== 0).map((net) => net.name),
  ).toEqual(["/First/R1_.pin2_to_.R2_.pin1"])
})

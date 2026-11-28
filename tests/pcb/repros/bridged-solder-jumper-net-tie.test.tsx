import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { getKicadPcbDrc } from "../../fixtures/get-kicad-pcb-drc"

test("bridged solder jumper exports footprint copper bridge with net_tie_pad_groups and zero DRC shorts", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="16mm" height="10mm" routingDisabled schematicDisabled>
      <solderjumper
        name="SJ1"
        footprint="solderjumper3_bridged12"
        bridgedPins={[["1", "2"]]}
        pcbX={-2.54}
      />
      <trace from=".SJ1 > .pin1" to="net.V5" />
      <trace from=".SJ1 > .pin2" to="net.PUMP_V" />
      <trace from=".SJ1 > .pin3" to="net.VEXT" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pcb = converter.getOutput()
  const output = converter.getOutputString()

  expect(pcb.segments).toHaveLength(0)
  expect(pcb.footprints).toHaveLength(1)

  const footprint = pcb.footprints[0]!
  expect(footprint.netTiePadGroups?.groups).toEqual(["1,2"])
  expect(footprint.attr?.allowSoldermaskBridges).toBe(true)

  const copperLines = footprint.fpLines.filter((line) =>
    line.layer?.names.includes("F.Cu"),
  )
  expect(copperLines).toHaveLength(1)
  expect(copperLines[0]!.start?.x).toBeCloseTo(-1.79, 4)
  expect(copperLines[0]!.end?.x).toBeCloseTo(-0.75, 4)
  expect(copperLines[0]!.stroke?.width).toBeCloseTo(0.375, 4)

  const drc = await getKicadPcbDrc(output)
  const shorts = drc.violations.filter(
    (violation) => violation.type === "shorting_items",
  )
  const maskBridges = drc.violations.filter(
    (violation) => violation.type === "solder_mask_bridge",
  )

  expect(shorts).toEqual([])
  expect(maskBridges).toEqual([])
}, 30_000)

test("multi-bridge rotated and bottom-layer solder jumpers merge net_tie_pad_groups and transform local coordinates", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="24mm" height="20mm" routingDisabled schematicDisabled>
      <solderjumper
        name="SJ_ALL"
        footprint="solderjumper3_bridged123"
        bridgedPins={[["1", "2", "3"]]}
        pcbX={-5}
        pcbY={0}
        pcbRotation={90}
      />
      <solderjumper
        name="SJ_BOT"
        footprint="solderjumper2_bridged12"
        bridgedPins={[["1", "2"]]}
        pcbX={5}
        pcbY={0}
        pcbRotation={45}
        layer="bottom"
      />
      <trace from=".SJ_ALL > .pin1" to="net.A" />
      <trace from=".SJ_ALL > .pin2" to="net.B" />
      <trace from=".SJ_ALL > .pin3" to="net.C" />
      <trace from=".SJ_BOT > .pin1" to="net.D" />
      <trace from=".SJ_BOT > .pin2" to="net.E" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pcb = converter.getOutput()

  expect(pcb.segments).toHaveLength(0)

  const topJumper = pcb.footprints.find((fp) =>
    fp.libraryLink?.includes("solderjumper3_bridged123"),
  )
  expect(topJumper).toBeDefined()
  expect(topJumper!.netTiePadGroups?.groups).toEqual(["1,2,3"])
  const topCopperLines = topJumper!.fpLines.filter((line) =>
    line.layer?.names.includes("F.Cu"),
  )
  expect(topCopperLines).toHaveLength(2)
  expect(topCopperLines[0]!.start?.y).toBeCloseTo(0, 4)
  expect(topCopperLines[0]!.end?.y).toBeCloseTo(0, 4)

  const bottomJumper = pcb.footprints.find((fp) =>
    fp.libraryLink?.includes("solderjumper2_bridged12"),
  )
  expect(bottomJumper).toBeDefined()
  expect(bottomJumper!.netTiePadGroups?.groups).toEqual(["1,2"])
  const bottomCopperLines = bottomJumper!.fpLines.filter((line) =>
    line.layer?.names.includes("B.Cu"),
  )
  expect(bottomCopperLines).toHaveLength(1)
  expect(bottomCopperLines[0]!.start?.y).toBeCloseTo(0, 4)
  expect(bottomCopperLines[0]!.end?.y).toBeCloseTo(0, 4)

  const drc = await getKicadPcbDrc(converter.getOutputString())
  const shorts = drc.violations.filter(
    (violation) => violation.type === "shorting_items",
  )
  const maskBridges = drc.violations.filter(
    (violation) => violation.type === "solder_mask_bridge",
  )
  expect(shorts).toEqual([])
  expect(maskBridges).toEqual([])
}, 30_000)

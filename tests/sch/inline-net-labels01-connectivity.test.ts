import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { applyToPoint } from "transformation-matrix"
import { exportSchematicNetlist } from "../fixtures/export-schematic-netlist"
import { getInlineLabelCircuit } from "../fixtures/get-inline-label-circuit"

test("automatic inline labels connect the intended pins using local labels", async () => {
  const data = await getInlineLabelCircuit()
  const converter = new CircuitJsonToKicadSchConverter(data)
  converter.runUntilFinished()
  const sch = parseKicadSch(converter.getOutputString())
  expect(sch.labels.map((label) => label.value)).toEqual(["SIGNAL", "SIGNAL"])
  expect(sch.globalLabels).toHaveLength(0)
  expect(sch.texts.some((text) => text.value === "SIGNAL")).toBe(false)
  const endpoints = [
    { x: 1.06, y: 0 },
    { x: 18.94, y: 6 },
  ]
  for (const [index, point] of endpoints.entries()) {
    const expected = applyToPoint(converter.ctx.c2kMatSch!, point)
    expect(sch.labels[index]!.at!.x).toBeCloseTo(expected.x)
    expect(sch.labels[index]!.at!.y).toBeCloseTo(expected.y)
  }
  const nets = await exportSchematicNetlist(
    converter.getOutputFiles({ schematicFilename: "inline.kicad_sch" }),
  )
  expect(nets.find((net) => net.name.endsWith("SIGNAL"))?.pins).toEqual([
    "R1.2",
    "R2.1",
  ])
})

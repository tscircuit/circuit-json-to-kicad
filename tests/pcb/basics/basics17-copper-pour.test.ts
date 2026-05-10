import { test, expect } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import type { AnyCircuitElement } from "circuit-json"

/**
 * Regression test for: KiCad export drops pcb_copper_pour records
 * https://github.com/tscircuit/circuit-json-to-kicad/issues/284
 */

test("pcb copper pour - rect shape is exported as KiCad zone", () => {
  const circuitJson: AnyCircuitElement[] = [
    {
      type: "source_component",
      source_component_id: "sc1",
      name: "GND",
      ftype: "simple_net",
    } as any,
    {
      type: "source_net",
      source_net_id: "sn1",
      name: "GND",
      member_source_group_ids: [],
    } as any,
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pour1",
      layer: "top",
      source_net_id: "sn1",
      covered_with_solder_mask: true,
      shape: "rect",
      center: { x: 0, y: 0 },
      width: 10,
      height: 10,
    } as any,
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  // The output should contain a zone block
  expect(output).toContain("(zone")

  // Should contain the polygon with 4 corner points
  expect(output).toContain("(polygon")
  expect(output).toContain("(pts")

  // The zone should be on the front copper layer
  expect(output).toContain("F.Cu")

  // Snapshot for stability
  expect(output).toMatchSnapshot()
})

test("pcb copper pour - polygon shape is exported as KiCad zone", () => {
  const circuitJson: AnyCircuitElement[] = [
    {
      type: "source_net",
      source_net_id: "sn2",
      name: "VCC",
      member_source_group_ids: [],
    } as any,
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pour2",
      layer: "bottom",
      source_net_id: "sn2",
      covered_with_solder_mask: false,
      shape: "polygon",
      points: [
        { x: -5, y: -5 },
        { x: 5, y: -5 },
        { x: 5, y: 5 },
        { x: 0, y: 8 },
        { x: -5, y: 5 },
      ],
    } as any,
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  // Should contain a zone block on the back copper layer
  expect(output).toContain("(zone")
  expect(output).toContain("B.Cu")

  // Should have 5 points in the polygon
  const xyMatches = output.match(/\(xy [\d.eE+-]+ [\d.eE+-]+\)/g) ?? []
  expect(xyMatches.length).toBeGreaterThanOrEqual(5)

  expect(output).toMatchSnapshot()
})

test("pcb copper pour - no pours produces no zone blocks", () => {
  const circuitJson: AnyCircuitElement[] = []

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  expect(output).not.toContain("(zone")
})

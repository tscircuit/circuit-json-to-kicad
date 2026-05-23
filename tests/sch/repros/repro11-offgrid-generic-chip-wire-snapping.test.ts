import { expect, test } from "bun:test"
import { KicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"

test("repro11 off-grid generic chip traces snap to KiCad pin anchors", () => {
  const circuitJson = [
    {
      type: "source_component",
      source_component_id: "sc1",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "source_port",
      source_port_id: "sp1",
      source_component_id: "sc1",
      name: "1",
      pin_number: 1,
    },
    {
      type: "source_port",
      source_port_id: "sp2",
      source_component_id: "sc1",
      name: "2",
      pin_number: 2,
    },
    {
      type: "source_component",
      source_component_id: "sc2",
      name: "U2",
      ftype: "simple_chip",
    },
    {
      type: "source_port",
      source_port_id: "sp3",
      source_component_id: "sc2",
      name: "1",
      pin_number: 1,
    },
    {
      type: "source_port",
      source_port_id: "sp4",
      source_component_id: "sc2",
      name: "2",
      pin_number: 2,
    },
    {
      type: "schematic_component",
      schematic_component_id: "sch1",
      source_component_id: "sc1",
      center: { x: 0.13, y: 0.17 },
      rotation: 0,
      size: { width: 2, height: 1 },
    },
    {
      type: "schematic_component",
      schematic_component_id: "sch2",
      source_component_id: "sc2",
      center: { x: 4.31, y: 0.22 },
      rotation: 0,
      size: { width: 2, height: 1 },
    },
    {
      type: "schematic_port",
      schematic_port_id: "p1",
      schematic_component_id: "sch1",
      source_port_id: "sp1",
      center: { x: -0.77, y: 0.17 },
      pin_number: 1,
      display_pin_label: "1",
    },
    {
      type: "schematic_port",
      schematic_port_id: "p2",
      schematic_component_id: "sch1",
      source_port_id: "sp2",
      center: { x: 1.03, y: 0.17 },
      pin_number: 2,
      display_pin_label: "2",
    },
    {
      type: "schematic_port",
      schematic_port_id: "p3",
      schematic_component_id: "sch2",
      source_port_id: "sp3",
      center: { x: 3.41, y: 0.22 },
      pin_number: 1,
      display_pin_label: "1",
    },
    {
      type: "schematic_port",
      schematic_port_id: "p4",
      schematic_component_id: "sch2",
      source_port_id: "sp4",
      center: { x: 5.21, y: 0.22 },
      pin_number: 2,
      display_pin_label: "2",
    },
    {
      type: "schematic_trace",
      schematic_trace_id: "t1",
      edges: [{ from: { x: 1.03, y: 0.17 }, to: { x: 3.41, y: 0.22 } }],
      junctions: [],
    },
  ] as any

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const kicadSch = KicadSch.parse(converter.getOutputString())[0] as KicadSch
  const wirePoints = kicadSch.wires[0]?.points?.points as
    | Array<{ x: number; y: number }>
    | undefined
  expect(wirePoints).toBeDefined()

  const symbolsByRef = new Map(
    kicadSch.symbols.map((symbol: any) => [symbol.properties?.[0]?.value, symbol]),
  )
  const u1 = symbolsByRef.get("U1")
  const u2 = symbolsByRef.get("U2")

  expect(u1).toBeDefined()
  expect(u2).toBeDefined()

  expect(wirePoints?.[0]?.x).toBeCloseTo(u1.at.x + 21)
  expect(wirePoints?.[0]?.y).toBeCloseTo(u1.at.y)
  expect(wirePoints?.[1]?.x).toBeCloseTo(u2.at.x - 21)
  expect(wirePoints?.[1]?.y).toBeCloseTo(u2.at.y)
})

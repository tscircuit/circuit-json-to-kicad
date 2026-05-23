import { expect, test } from "bun:test"
import { KicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro11 off-grid wire endpoints miss exported KiCad pin anchors", async () => {
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

  const output = converter.getOutputString()

  const kicadSch = KicadSch.parse(output)[0] as KicadSch
  const wirePoints = kicadSch.wires[0]?.points?.points as
    | Array<{ x: number; y: number }>
    | undefined
  expect(wirePoints).toBeDefined()

  const symbolsByRef = new Map(
    kicadSch.symbols.map((symbol: any) => [
      symbol.properties?.[0]?.value,
      symbol,
    ]),
  )
  const u1 = symbolsByRef.get("U1")
  const u2 = symbolsByRef.get("U2")

  expect(u1).toBeDefined()
  expect(u2).toBeDefined()

  const wireStart = wirePoints![0]!
  const wireEnd = wirePoints![1]!
  const expectedStart = { x: u1.at.x + 21, y: u1.at.y }
  const expectedEnd = { x: u2.at.x - 21, y: u2.at.y }

  expect(wireStart.x - expectedStart.x).toBeCloseTo(-7.5)
  expect(wireStart.y - expectedStart.y).toBeCloseTo(0)
  expect(wireEnd.x - expectedEnd.x).toBeCloseTo(7.5)
  expect(wireEnd.y - expectedEnd.y).toBeCloseTo(0)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })

  expect(kicadSnapshot.exitCode).toBe(0)
  expect(
    kicadSnapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 15_000)

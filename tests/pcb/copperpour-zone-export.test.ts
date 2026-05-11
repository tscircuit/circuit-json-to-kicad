import { test, expect } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

// Regression: pcb_copper_pour records in circuit.json must translate to
// KiCad (zone …) blocks in the .kicad_pcb output. Previously the
// converter emitted 0 (zone) blocks regardless of how many pours
// existed in the input, leaving KiCad's pcbnew unable to display
// ground planes / pour fills designed in tscircuit.

test("pcb_copper_pour translates to a KiCad (zone …) block", () => {
  const circuitJson: any[] = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      thickness: 1.6,
      num_layers: 2,
    },
    {
      type: "source_net",
      source_net_id: "source_net_0",
      name: "GND",
      member_source_group_ids: [],
      subcircuit_connectivity_map_key: "gnd",
    },
    {
      type: "source_trace",
      source_trace_id: "source_trace_0",
      connected_source_port_ids: [],
      connected_source_net_ids: ["source_net_0"],
      subcircuit_connectivity_map_key: "gnd",
    },
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pcb_copper_pour_0",
      shape: "brep",
      layer: "bottom",
      source_net_id: "source_net_0",
      brep_shape: {
        outer_ring: {
          vertices: [
            { x: -8, y: -8 },
            { x: 8, y: -8 },
            { x: 8, y: 8 },
            { x: -8, y: 8 },
          ],
        },
        inner_rings: [],
      },
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  // A zone block was emitted.
  const numZones = (output.match(/\(zone\b/g) || []).length
  expect(numZones).toBe(1)

  // Net resolution worked: the zone is on net 1 named "GND".
  expect(output).toMatch(/\(zone\b[\s\S]*?\(net 1\)[\s\S]*?\(net_name GND\)/)

  // Layer is correctly mapped: bottom → B.Cu
  expect(output).toMatch(/\(zone\b[\s\S]*?\(layer B\.Cu\)/)

  // Polygon outline is emitted with the four vertices we provided
  // (transformed through the c2kMatPcb origin shift + Y-flip).
  expect(output).toMatch(/\(polygon\s+\(pts\b/)
  // Four (xy ...) points.
  const xyPoints = output.match(/\(xy [^)]+\)/g) || []
  expect(xyPoints.length).toBeGreaterThanOrEqual(4)
})

test("pcb_copper_pour without resolvable source_net falls back to net 0", () => {
  const circuitJson: any[] = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      thickness: 1.6,
      num_layers: 2,
    },
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pcb_copper_pour_0",
      shape: "brep",
      layer: "bottom",
      // no source_net_id at all
      brep_shape: {
        outer_ring: {
          vertices: [
            { x: -5, y: -5 },
            { x: 5, y: -5 },
            { x: 5, y: 5 },
            { x: -5, y: 5 },
          ],
        },
        inner_rings: [],
      },
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  expect((output.match(/\(zone\b/g) || []).length).toBe(1)
  expect(output).toMatch(/\(zone\b[\s\S]*?\(net 0\)/)
})

test("pcb_copper_pour with inner_rings emits cutout polygons", () => {
  const circuitJson: any[] = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      thickness: 1.6,
      num_layers: 2,
    },
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pcb_copper_pour_0",
      shape: "brep",
      layer: "bottom",
      brep_shape: {
        outer_ring: {
          vertices: [
            { x: -8, y: -8 },
            { x: 8, y: -8 },
            { x: 8, y: 8 },
            { x: -8, y: 8 },
          ],
        },
        inner_rings: [
          {
            vertices: [
              { x: -1, y: -1 },
              { x: 1, y: -1 },
              { x: 1, y: 1 },
              { x: -1, y: 1 },
            ],
          },
        ],
      },
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  // Outline + cutout = 2 polygons.
  const polygons = output.match(/\(polygon\s+\(pts\b/g) || []
  expect(polygons.length).toBeGreaterThanOrEqual(2)
})

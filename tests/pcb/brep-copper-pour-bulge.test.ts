import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("exports brep copper pours with bulge arcs and circular cutout holes", () => {
  const circuitJson = [
    {
      type: "source_net",
      source_net_id: "source_net_gnd",
      name: "GND",
    },
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      num_layers: 2,
      thickness: 1.6,
      material: "fr4",
    },
    // Circular BRep pour defined by 2 semicircle vertices with bulge = 1 and omitted inner_rings
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pcb_copper_pour_circle",
      shape: "brep",
      layer: "bottom",
      source_net_id: "source_net_gnd",
      covered_with_solder_mask: true,
      brep_shape: {
        outer_ring: {
          vertices: [
            { x: -5, y: 0, bulge: 1 },
            { x: 5, y: 0, bulge: 1 },
          ],
        },
      },
    },
    // Rectangular BRep pour with a 2-vertex circular inner_ring cutout hole (bulge = -1)
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pcb_copper_pour_with_circular_hole",
      shape: "brep",
      layer: "top",
      source_net_id: "source_net_gnd",
      covered_with_solder_mask: true,
      brep_shape: {
        outer_ring: {
          vertices: [
            { x: -8, y: 8 },
            { x: -8, y: -8 },
            { x: 8, y: -8 },
            { x: 8, y: 8 },
          ],
        },
        inner_rings: [
          {
            vertices: [
              { x: -2, y: 0, bulge: -1 },
              { x: 2, y: 0, bulge: -1 },
            ],
          },
        ],
      },
    },
  ] as unknown as CircuitJson

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  const parsedPcb = parseKicadPcb(outputString)

  expect(parsedPcb.zones).toHaveLength(2)

  const [bottomCircleZone, topHoleZone] = parsedPcb.zones

  expect(outputString).toContain("(layer B.Cu)")
  expect(outputString).toContain("(layer F.Cu)")
  expect(outputString).toContain("(net 1)")
  expect(outputString).toContain("(net_name GND)")

  expect(bottomCircleZone?.polygons).toHaveLength(1)
  expect(
    bottomCircleZone?.polygons[0]?.pts?.points.length ?? 0,
  ).toBeGreaterThanOrEqual(32)
  expect(bottomCircleZone?.filledPolygons.length).toBe(1)

  expect(topHoleZone?.polygons).toHaveLength(2)
  expect(
    topHoleZone?.polygons[1]?.pts?.points.length ?? 0,
  ).toBeGreaterThanOrEqual(32)
  expect(topHoleZone?.filledPolygons.length).toBeGreaterThan(2)
})

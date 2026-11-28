import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { tessellateBrepRingVertices } from "lib/pcb/stages/utils/tessellate-brep-ring-vertices"
import { Circuit } from "tscircuit"

test("tessellates brep copper pour bulge arcs and preserves circular via cutouts in KiCad export", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <resistor
        name="R1"
        resistance="10k"
        footprint="0402"
        pcbX={-5}
        pcbY={0}
      />
      <resistor name="R2" resistance="10k" footprint="0402" pcbX={5} pcbY={0} />
      <via
        pcbX={0}
        pcbY={0}
        outerDiameter="0.8mm"
        holeDiameter="0.4mm"
        fromLayer="top"
        toLayer="bottom"
      />
      <trace from=".R1 > .pin1" to="net.GND" />
      <trace from=".R2 > .pin2" to="net.VCC" />
      <copperpour connectsTo="net.GND" layer="top" clearance="0.2mm" />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  // Inject a two-vertex bulge=1 circular inner cutout (1mm radius around origin) and rounded outer corner
  const quarterCircleBulge = Math.SQRT2 - 1
  for (const element of circuitJson) {
    if (element.type === "pcb_copper_pour" && element.shape === "brep") {
      element.brep_shape = {
        outer_ring: {
          vertices: [
            { x: -7, y: -8 },
            { x: 7, y: -8, bulge: quarterCircleBulge },
            { x: 8, y: -7 },
            { x: 8, y: 8 },
            { x: -8, y: 8 },
            { x: -8, y: -7, bulge: quarterCircleBulge },
          ],
        },
        inner_rings: [
          {
            vertices: [
              { x: 1, y: 0, bulge: 1 },
              { x: -1, y: 0, bulge: 1 },
            ],
          },
        ],
      }
    }
  }

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const parsed = parseKicadPcb(converter.getOutputString())
  expect(parsed.zones).toHaveLength(1)

  const zone = parsed.zones[0]!
  expect(zone.polygons).toHaveLength(2)

  const outerPts = zone.polygons[0]?.pts?.points ?? []
  const holePts = zone.polygons[1]?.pts?.points ?? []
  expect(outerPts.length).toBeGreaterThan(10)
  expect(holePts.length).toBeGreaterThanOrEqual(32)
  expect(zone.filledPolygons.length).toBeGreaterThan(0)

  for (const pt of holePts) {
    if ("x" in pt && "y" in pt) {
      expect(Math.hypot(pt.x - 100, pt.y - 100)).toBeCloseTo(1, 5)
    }
  }
})

test("tessellateBrepRingVertices handles undefined, empty, and clockwise/counter-clockwise bulges", () => {
  expect(tessellateBrepRingVertices()).toEqual([])
  expect(tessellateBrepRingVertices([])).toEqual([])

  const cwCircle = tessellateBrepRingVertices([
    { x: 0, y: 2, bulge: -1 },
    { x: 0, y: -2, bulge: -1 },
  ])
  expect(cwCircle.length).toBeGreaterThanOrEqual(32)
  for (const point of cwCircle) {
    expect(Math.hypot(point.x, point.y)).toBeCloseTo(2, 6)
  }
})

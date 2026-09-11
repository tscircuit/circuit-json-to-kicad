import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createSilkscreenTextPolygons } from "lib/pcb/stages/utils/createSilkscreenTextPolygons"
import { identity } from "transformation-matrix"

const python = process.env.KICAD_PYTHON ?? "python3"
const hasPcbnew = spawnSync(python, ["-c", "import pcbnew"]).status === 0

test.skipIf(!hasPcbnew)(
  "native KiCad preserves filled letter area and glyph holes",
  async () => {
    const circuit = new Circuit()
    circuit.add(
      <board width={10.4} height={10.4}>
        <silkscreentext text="ABOW" fontSize={0.8} />
        <resistor
          name="R1"
          resistance="1k"
          footprint="0402"
          pcbX={2}
          pcbY={3}
          pcbRotation={90}
        />
      </board>,
    )
    await circuit.renderUntilSettled()
    const json = circuit.getCircuitJson()
    const source = json.find((e) => e.type === "pcb_silkscreen_text")!
    if (source.type !== "pcb_silkscreen_text") throw Error("Missing text")
    const component = json.find((e) => e.type === "pcb_component")!
    if (component.type !== "pcb_component") throw Error("Missing component")
    const footprintText = {
      ...source,
      pcb_silkscreen_text_id: "outline-footprint-text",
      pcb_component_id: component.pcb_component_id,
      anchor_position: { x: 3, y: 2 },
      ccw_rotation: 90,
      layer: "bottom" as const,
    }
    json.push(footprintText)
    const triangles = createSilkscreenTextPolygons(source, identity())
    const expectedArea = triangles.reduce(
      (area, [a, b, c]) =>
        area +
        Math.abs(
          (b!.x - a!.x) * (c!.y - a!.y) - (b!.y - a!.y) * (c!.x - a!.x),
        ) /
          2,
      0,
    )
    const converter = new CircuitJsonToKicadPcbConverter(json)
    converter.runUntilFinished()
    const output = converter.getOutputString()
    expect(output).not.toContain("(gr_text")
    expect(output).toContain("(gr_poly")
    const dir = mkdtempSync(join(tmpdir(), "kicad-font-outlines-"))
    try {
      const path = join(dir, "font.kicad_pcb")
      writeFileSync(path, output)
      const result = spawnSync(
        python,
        [
          "-c",
          `
import json,sys,pcbnew
board=pcbnew.LoadBoard(sys.argv[1])
shapes=[s for s in board.GetDrawings() if s.GetLayer()==pcbnew.F_SilkS]
footprints=list(board.GetFootprints())
fp_shapes=[s for s in footprints[0].GraphicalItems() if isinstance(s,pcbnew.PCB_SHAPE) and s.GetLayer()==pcbnew.B_SilkS]
def bounds(items):
    boxes=[s.GetBoundingBox() for s in items]
    return [min(b.GetLeft() for b in boxes)/1e6,min(b.GetTop() for b in boxes)/1e6,max(b.GetRight() for b in boxes)/1e6,max(b.GetBottom() for b in boxes)/1e6]
print(json.dumps({'count':len(shapes),'area':sum(s.GetPolyShape().Area() for s in shapes)/1e12,'widths':[s.GetWidth() for s in shapes], 'footprintArea':sum(s.GetPolyShape().Area() for s in fp_shapes)/1e12,'footprintBounds':bounds(fp_shapes),'reference':footprints[0].GetReference()}))
`,
          path,
        ],
        { encoding: "utf8" },
      )
      expect(result.status, result.stderr).toBe(0)
      const native = JSON.parse(result.stdout)
      expect(native.count).toBe(triangles.length)
      expect(native.area).toBeCloseTo(expectedArea, 5)
      expect(native.footprintArea).toBeCloseTo(expectedArea, 5)
      expect(native.reference).toBe("R1")
      const fpPoints = createSilkscreenTextPolygons(footprintText, identity())
        .flat()
        .map((p) => ({ x: 100 + p.x, y: 100 - p.y }))
      const expectedBounds = [
        Math.min(...fpPoints.map((p) => p.x)),
        Math.min(...fpPoints.map((p) => p.y)),
        Math.max(...fpPoints.map((p) => p.x)),
        Math.max(...fpPoints.map((p) => p.y)),
      ]
      expectedBounds.forEach((value, i) =>
        expect(native.footprintBounds[i]).toBeCloseTo(value, 5),
      )
      expect(native.widths.every((width: number) => width === 0)).toBe(true)
      // The O counter must remain empty after triangulation.
      const o = createSilkscreenTextPolygons(
        { ...source, text: "O" },
        identity(),
      )
      const coversOrigin = o.some(([a, b, c]) => {
        const cross = (
          p: { x: number; y: number },
          q: { x: number; y: number },
        ) => p.x * q.y - p.y * q.x
        const signs = [cross(a!, b!), cross(b!, c!), cross(c!, a!)]
        return signs.every((n) => n >= 0) || signs.every((n) => n <= 0)
      })
      expect(coversOrigin).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)

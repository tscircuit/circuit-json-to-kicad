// bun test tests/pcb/basics/basics17-bottom-layer-footprint.test.tsx
// BUN_UPDATE_SNAPSHOTS=1 bun test tests/pcb/basics/basics17-bottom-layer-footprint.test.tsx
import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

// Regression: when a component is placed on the bottom copper layer
// (`pcb_component.layer === "bottom"`), the exported KiCad `.kicad_pcb`
// must emit `(layer B.Cu)` at the top of the corresponding `(footprint
// ...)` block. Previously the converter always emitted `(layer F.Cu)`,
// so KiCad showed "Board Side: Front" for every component — including
// ones whose pads were correctly on B.Cu/B.Paste/B.Mask. The footprint
// header layer is the field KiCad reads for the side property.

test("pcb basics17 bottom-layer component → (layer B.Cu) in footprint header", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="14mm">
      <resistor
        name="R_TOP"
        resistance="10k"
        footprint="0402"
        pcbX={-5}
        pcbY={0}
      />
      <resistor
        name="R_BOTTOM"
        resistance="10k"
        footprint="0402"
        pcbX={5}
        pcbY={0}
        layer="bottom"
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const sExpr = converter.getOutputString()

  // Pull each (footprint ...) block; classify by whether any pad inside
  // is on B.Cu / B.Paste / B.Mask, then read the footprint-header layer.
  const blocks = extractFootprintBlocks(sExpr)
  expect(blocks.length).toBe(2)

  const headerLayer = (block: string): string | null => {
    // First (layer ...) inside the block is the footprint-header layer.
    // Skip past `(footprint\n  "..."\n` to find the first one.
    const after = block.slice(block.indexOf("\n") + 1)
    const m = after.match(/\(layer\s+"?([^"\s)]+)"?\s*\)/)
    return m ? m[1]! : null
  }

  const isBottomByPad = (block: string): boolean =>
    /\(layers\s+B\.Cu\b/.test(block)

  const topBlock = blocks.find((b) => !isBottomByPad(b))!
  const bottomBlock = blocks.find((b) => isBottomByPad(b))!

  expect(topBlock).toBeDefined()
  expect(bottomBlock).toBeDefined()
  expect(headerLayer(topBlock)).toBe("F.Cu")
  // Regression: this used to be "F.Cu", which made KiCad show
  // "Board Side: Front" for back-side components.
  expect(headerLayer(bottomBlock)).toBe("B.Cu")
})

/**
 * Returns the paren-balanced text of every (footprint ...) block in
 * the s-expression input.
 */
function extractFootprintBlocks(sExpr: string): string[] {
  const out: string[] = []
  const re = /\(footprint\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(sExpr)) !== null) {
    const start = m.index
    let depth = 0
    for (let i = start; i < sExpr.length; i++) {
      if (sExpr[i] === "(") depth++
      else if (sExpr[i] === ")") {
        depth--
        if (depth === 0) {
          out.push(sExpr.slice(start, i + 1))
          break
        }
      }
    }
  }
  return out
}

import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import sharp from "sharp"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { applyToPoint } from "transformation-matrix"
import fixture from "../../assets/footprint-origin.circuit.json"

const formatMm = (millimeters: number) => Number(millimeters.toFixed(4))

// Generated from footprint-origin-board.tsx using core#4806. Keep real producer
// output: the reference holes, CAD models and authored origins must agree.
test("KiCad preserves authored footprint origins and legacy center fallback", async () => {
  const circuitJson = structuredClone(fixture) as CircuitJson
  const components = circuitJson.filter(
    (element) => element.type === "pcb_component",
  )
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  const componentFootprints = output.footprints.filter(
    (footprint) => footprint.models.length > 0,
  )
  // Points in board-world mm (+X right, +Y up) become KiCad PCB points
  // (+X right, +Y down) through the converter's shared placement transform.
  const boardToKicadTransform = converter.ctx.c2kMatPcb!
  const labels = componentFootprints
    .map((footprint, footprintIndex) => {
      const referencePad = footprint.fpPads.find((pad) => pad.drill)!
      const modelOffset = footprint.models[0]!.offset!
      return `<text x="20" y="${25 + footprintIndex * 20}" fill="#ffd166" font-family="sans-serif" font-size="15">U${footprintIndex + 1}: footprint (${formatMm(footprint.position!.x)}, ${formatMm(footprint.position!.y)}); reference hole (${formatMm(referencePad.at!.x)}, ${formatMm(referencePad.at!.y)}); model offset (${formatMm(modelOffset.x)}, ${formatMm(modelOffset.y)})</text>`
    })
    .join("")
  const svg = convertCircuitJsonToPcbSvg(circuitJson, {
    width: 1200,
    height: 900,
  }).replace("</svg>", `${labels}</svg>`)
  await expect(sharp(Buffer.from(svg)).png().toBuffer()).toMatchPngSnapshot(
    import.meta.path,
  )
  const standaloneSolderPasteCount = circuitJson.filter(
    (element) =>
      element.type === "pcb_solder_paste" &&
      !element.pcb_component_id &&
      !element.pcb_smtpad_id,
  ).length
  expect(output.footprints).toHaveLength(
    components.length + standaloneSolderPasteCount,
  )
  expect(componentFootprints).toHaveLength(components.length)
  for (const [componentIndex, component] of components.entries()) {
    const footprint = componentFootprints[componentIndex]!
    const expectedFootprintPosition = applyToPoint(
      boardToKicadTransform,
      component.footprint_origin!,
    )
    expect(footprint.position!.x).toBeCloseTo(expectedFootprintPosition.x)
    expect(footprint.position!.y).toBeCloseTo(expectedFootprintPosition.y)
    const drilledPad = footprint.fpPads.find((pad) => pad.drill)!
    expect(drilledPad.at!.x).toBeCloseTo(0)
    expect(drilledPad.at!.y).toBeCloseTo(0)
    expect(footprint.models).toHaveLength(1)
    expect(footprint.models[0]!.offset!.x).toBeCloseTo(0)
    expect(footprint.models[0]!.offset!.y).toBeCloseTo(0)
  }
  for (const component of components) delete component.footprint_origin
  const legacyConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  legacyConverter.runUntilFinished()
  const legacy = KicadPcb.parse(
    legacyConverter.getOutputString(),
  )[0] as KicadPcb
  const legacyComponentFootprints = legacy.footprints.filter(
    (footprint) => footprint.models.length > 0,
  )
  for (const [componentIndex, component] of components.entries()) {
    const expectedLegacyPosition = applyToPoint(
      boardToKicadTransform,
      component.center,
    )
    expect(legacyComponentFootprints[componentIndex]!.position!.x).toBeCloseTo(
      expectedLegacyPosition.x,
    )
    expect(legacyComponentFootprints[componentIndex]!.position!.y).toBeCloseTo(
      expectedLegacyPosition.y,
    )
  }
})

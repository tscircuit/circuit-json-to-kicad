import { expect, test } from "bun:test"
import { createThruHolePadFromCircuitJson } from "lib/pcb/stages/utils/CreateThruHolePadFromCircuitJson"

const platedHoleBase = {
  type: "pcb_plated_hole" as const,
  shape: "pill_hole_with_rect_pad" as const,
  hole_shape: "pill" as const,
  pad_shape: "rect" as const,
  hole_width: 0.6,
  hole_height: 1.2,
  rect_pad_width: 1.6,
  rect_pad_height: 2,
  layers: ["F.Cu", "B.Cu"],
  pcb_plated_hole_id: "visual_ph",
}

const SCALE = 80
const MARGIN = 1.5

function renderPadsToSvg(
  pads: ReturnType<typeof createThruHolePadFromCircuitJson>[],
) {
  const validPads = pads.filter((pad): pad is NonNullable<typeof pad> =>
    Boolean(pad),
  )
  if (validPads.length === 0) {
    throw new Error("No pads provided for rendering")
  }

  const minX =
    Math.min(
      ...validPads.map((pad) => {
        const at = pad.at
        const size = pad.size
        if (!at || !size) throw new Error("Pad missing position or size")
        return at.x - size.width / 2
      }),
    ) - MARGIN
  const maxX =
    Math.max(
      ...validPads.map((pad) => {
        const at = pad.at
        const size = pad.size
        if (!at || !size) throw new Error("Pad missing position or size")
        return at.x + size.width / 2
      }),
    ) + MARGIN
  const minY =
    Math.min(
      ...validPads.map((pad) => {
        const at = pad.at
        const size = pad.size
        if (!at || !size) throw new Error("Pad missing position or size")
        return at.y - size.height / 2
      }),
    ) - MARGIN
  const maxY =
    Math.max(
      ...validPads.map((pad) => {
        const at = pad.at
        const size = pad.size
        if (!at || !size) throw new Error("Pad missing position or size")
        return at.y + size.height / 2
      }),
    ) + MARGIN

  const width = (maxX - minX) * SCALE
  const height = (maxY - minY) * SCALE

  const padGroups = validPads
    .map((pad, index) => {
      const at = pad.at
      const size = pad.size
      const drill = pad.drill
      if (!at || !size || !drill) {
        throw new Error("Pad missing geometry for visualization")
      }

      const padCenterX = (at.x - minX) * SCALE
      const padCenterY = (at.y - minY) * SCALE
      const padWidth = size.width * SCALE
      const padHeight = size.height * SCALE
      const padRotation = at.angle || 0
      const offsetX = (drill.offset?.x ?? 0) * SCALE
      const offsetY = (drill.offset?.y ?? 0) * SCALE
      const holeElement = drill.oval
        ? `<ellipse cx="${offsetX}" cy="${offsetY}" rx="${(drill.diameter / 2) * SCALE}" ry="${(drill.width! / 2) * SCALE}" fill="#1e1e1e" />`
        : `<circle cx="${offsetX}" cy="${offsetY}" r="${(drill.diameter / 2) * SCALE}" fill="#1e1e1e" />`

      return [
        `      <g transform="translate(${padCenterX}, ${padCenterY}) rotate(${padRotation})">`,
        `        <rect x="${-padWidth / 2}" y="${-padHeight / 2}" width="${padWidth}" height="${padHeight}" fill="#d9a066" stroke="#4a3728" stroke-width="4" rx="${pad.shape === "rect" ? padWidth * 0.12 : 0}" ry="${pad.shape === "rect" ? padWidth * 0.12 : 0}" />`,
        `        ${holeElement}`,
        `        <text x="${padWidth / 2 + 12}" y="${padHeight / 2 + 20}" font-size="36" fill="#444" font-family="Arial, sans-serif">Pad ${
          index + 1
        }</text>`,
        "      </g>",
      ].join("\n")
    })
    .join("\n")

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#f5f5f5" />
    <g>
${padGroups}
    </g>
  </svg>`

  return svg
}

test("createThruHolePadFromCircuitJson visualizes hole offsets", async () => {
  const centeredPad = createThruHolePadFromCircuitJson({
    platedHole: {
      ...platedHoleBase,
      hole_offset_x: 0.3,
      hole_offset_y: 0.15,
      x: -3,
      y: 0,
    } as any,
    componentCenter: { x: 0, y: 0 },
    padNumber: 1,
    componentRotation: 0,
  })

  const rotatedPad = createThruHolePadFromCircuitJson({
    platedHole: {
      ...platedHoleBase,
      hole_offset_x: 0.3,
      hole_offset_y: 0.15,
      x: 3,
      y: 0,
    } as any,
    componentCenter: { x: 0, y: 0 },
    padNumber: 2,
    componentRotation: 90,
  })

  const svg = renderPadsToSvg([centeredPad, rotatedPad])

  await expect(svg).toMatchSnapshot()
})

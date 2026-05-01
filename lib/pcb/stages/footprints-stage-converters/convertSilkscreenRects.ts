import type { PcbSilkscreenRect } from "circuit-json"
import { FpRect, Stroke } from "kicadts"
import { applyToPoint, compose, rotate, scale } from "transformation-matrix"

/**
 * Converts pcb_silkscreen_rect elements to KiCad fp_rect footprint primitives.
 *
 * Coordinates are transformed to footprint-local space (relative to component
 * center) and the Y axis is flipped to match KiCad's coordinate convention.
 * An optional component rotation is applied so that rectangles stay correctly
 * oriented when the footprint is placed at an angle.
 */
export function convertSilkscreenRects(
  silkscreenRects: PcbSilkscreenRect[],
  componentCenter: { x: number; y: number },
  componentRotation = 0,
): FpRect[] {
  const fpRects: FpRect[] = []

  const layerMap: Record<string, string> = {
    top: "F.SilkS",
    bottom: "B.SilkS",
  }

  // Build a matrix that:
  // 1. Translates so component center becomes origin
  // 2. Flips Y axis (circuit-json Y+ is up, KiCad Y+ is down)
  // 3. Applies component rotation (if any)
  //
  // Using separate rotation + scale here since compose() applies right-to-left.
  const rotMat =
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

  for (const rect of silkscreenRects) {
    const kicadLayer = layerMap[rect.layer] ?? rect.layer ?? "F.SilkS"

    const halfW = rect.width / 2
    const halfH = rect.height / 2

    // Four corners of the rect in circuit-json world coords
    const corners = [
      { x: rect.center.x - halfW, y: rect.center.y - halfH },
      { x: rect.center.x + halfW, y: rect.center.y + halfH },
    ]

    // Transform to footprint-local KiCad coords
    const transformed = corners.map((pt) =>
      applyToPoint(rotMat, {
        x: pt.x - componentCenter.x,
        y: -(pt.y - componentCenter.y), // flip Y
      }),
    )

    const [tl, br] = transformed as [
      { x: number; y: number },
      { x: number; y: number },
    ]

    // Ensure start < end after potential rotation
    const startX = Math.min(tl.x, br.x)
    const startY = Math.min(tl.y, br.y)
    const endX = Math.max(tl.x, br.x)
    const endY = Math.max(tl.y, br.y)

    const fpRect = new FpRect({
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      layer: kicadLayer,
      stroke: new Stroke(),
      fill: false,
    })

    if (fpRect.stroke) {
      fpRect.stroke.width = rect.stroke_width ?? 0.05
      fpRect.stroke.type = "default"
    }

    fpRects.push(fpRect)
  }

  return fpRects
}

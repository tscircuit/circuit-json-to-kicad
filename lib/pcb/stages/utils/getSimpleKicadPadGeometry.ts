type SimplePadGeometryInput =
  | { shape: "circle"; radius: number }
  | {
      shape: "rect" | "rotated_rect"
      width: number
      height: number
      ccw_rotation?: number
      corner_radius?: number
      rect_border_radius?: number
    }
  | {
      shape: "pill" | "rotated_pill"
      width: number
      height: number
      radius?: number
      ccw_rotation?: number
    }

export interface SimpleKicadPadGeometry {
  shape: "circle" | "rect" | "roundrect"
  size: [number, number]
  rotation: number
  roundrectRatio?: number
}

export const getResolvedPillRadius = ({
  width,
  height,
  radius,
}: {
  width: number
  height: number
  radius?: number
}): number =>
  typeof radius === "number" && Number.isFinite(radius)
    ? radius
    : Math.min(width, height) / 2

/** Maps Circuit JSON's simple pad shapes to their native KiCad geometry. */
export const getSimpleKicadPadGeometry = (
  pad: SimplePadGeometryInput,
): SimpleKicadPadGeometry => {
  switch (pad.shape) {
    case "circle":
      return {
        shape: "circle",
        size: [pad.radius * 2, pad.radius * 2],
        rotation: 0,
      }

    case "rect":
    case "rotated_rect": {
      const cornerRadius = pad.corner_radius ?? pad.rect_border_radius
      return {
        shape: cornerRadius ? "roundrect" : "rect",
        size: [pad.width, pad.height],
        rotation: pad.shape === "rotated_rect" ? (pad.ccw_rotation ?? 0) : 0,
        roundrectRatio: cornerRadius
          ? cornerRadius / Math.min(pad.width, pad.height)
          : undefined,
      }
    }

    case "pill":
    case "rotated_pill":
      return {
        shape: "roundrect",
        size: [pad.width, pad.height],
        rotation: pad.shape === "rotated_pill" ? (pad.ccw_rotation ?? 0) : 0,
        roundrectRatio:
          getResolvedPillRadius(pad) / Math.min(pad.width, pad.height),
      }
  }
}

type NativePadGeometryInput =
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

export interface KicadNativePadGeometry {
  shape: "circle" | "rect" | "roundrect"
  size: [number, number]
  rotation: number
  roundrectRatio?: number
}

/**
 * Older Circuit JSON files omitted radius for pill-shaped paste apertures.
 * A pill's radius is unambiguously half its shorter side in those files.
 */
export const getResolvedPillRadius = ({
  width,
  height,
  radius,
}: {
  width: number
  height: number
  radius?: number
}): number =>
  typeof radius === "number" && Number.isFinite(radius) && radius > 0
    ? radius
    : Math.min(width, height) / 2

const getFinitePositiveDimension = (
  value: unknown,
  fallback: number,
): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback

const getFiniteNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

/** Maps Circuit JSON shapes that have native KiCad pad equivalents. */
export const getKicadNativePadGeometry = (
  pad: NativePadGeometryInput,
): KicadNativePadGeometry => {
  switch (pad.shape) {
    case "circle": {
      const radius = getFinitePositiveDimension(pad.radius, 0.5)
      return {
        shape: "circle",
        size: [radius * 2, radius * 2],
        rotation: 0,
      }
    }

    case "rect":
    case "rotated_rect": {
      const width = getFinitePositiveDimension(pad.width, 1.0)
      const height = getFinitePositiveDimension(pad.height, 1.0)
      const rawCornerRadius = pad.corner_radius ?? pad.rect_border_radius
      const cornerRadius =
        typeof rawCornerRadius === "number" &&
        Number.isFinite(rawCornerRadius) &&
        rawCornerRadius > 0
          ? rawCornerRadius
          : 0
      return {
        shape: cornerRadius ? "roundrect" : "rect",
        size: [width, height],
        rotation:
          pad.shape === "rotated_rect" ? getFiniteNumber(pad.ccw_rotation) : 0,
        roundrectRatio: cornerRadius
          ? cornerRadius / Math.min(width, height)
          : undefined,
      }
    }

    case "pill":
    case "rotated_pill": {
      const width = getFinitePositiveDimension(pad.width, 1.0)
      const height = getFinitePositiveDimension(pad.height, 1.0)
      return {
        shape: "roundrect",
        size: [width, height],
        rotation:
          pad.shape === "rotated_pill" ? getFiniteNumber(pad.ccw_rotation) : 0,
        roundrectRatio:
          getResolvedPillRadius({ width, height, radius: pad.radius }) /
          Math.min(width, height),
      }
    }
  }
}

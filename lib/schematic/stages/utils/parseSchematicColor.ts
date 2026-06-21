const DEFAULT_SCHEMATIC_COLOR = { r: 0, g: 0, b: 0, a: 1 } as const
const RGBA_COLOR_REGEX =
  /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d+(?:\.\d+)?)\s*)?\)$/i

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

export function parseSchematicColor(color?: string): {
  r: number
  g: number
  b: number
  a: number
} {
  if (!color) return { ...DEFAULT_SCHEMATIC_COLOR }

  const rgbaMatch = color.match(RGBA_COLOR_REGEX)
  if (rgbaMatch) {
    return {
      r: clamp(Math.round(Number(rgbaMatch[1])), 0, 255),
      g: clamp(Math.round(Number(rgbaMatch[2])), 0, 255),
      b: clamp(Math.round(Number(rgbaMatch[3])), 0, 255),
      a: clamp(rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4]), 0, 1),
    }
  }

  const hex = color.replace("#", "")
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: 1,
    }
  }

  if (/^[0-9a-f]{8}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: Number.parseInt(hex.slice(6, 8), 16) / 255,
    }
  }

  return { ...DEFAULT_SCHEMATIC_COLOR }
}

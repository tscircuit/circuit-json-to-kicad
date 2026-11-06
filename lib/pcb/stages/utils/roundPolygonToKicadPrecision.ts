import type { MultiPolygon } from "polygon-clipping"

// KiCad PCB coordinates have a resolution of 1 nm (six decimal places in mm).
// Round clipping inputs so rotation roundoff does not turn shared edges
// into almost-coincident segments that polygon-clipping cannot assemble.
// Round results too, before checking for zero-length Edge.Cuts segments.
// https://dev-docs.kicad.org/en/file-formats/sexpr-intro/#_board_coordinates
const KICAD_PCB_UNITS_PER_MM = 1_000_000

export const roundBoardCoordinate = (coordinateMm: number) =>
  Math.round(coordinateMm * KICAD_PCB_UNITS_PER_MM) / KICAD_PCB_UNITS_PER_MM

export const roundPolygonToKicadPrecision = (
  geometry: MultiPolygon,
): MultiPolygon =>
  geometry.map((polygon) =>
    polygon.map((ring) =>
      ring.map(([x, y]) => [roundBoardCoordinate(x), roundBoardCoordinate(y)]),
    ),
  )

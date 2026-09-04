type Point3 = { x: number; y: number; z: number }

const radians = (degrees: number) => (degrees * Math.PI) / 180

function rotate(point: Point3, axis: "x" | "y" | "z", degrees: number): Point3 {
  const c = Math.cos(radians(degrees))
  const s = Math.sin(radians(degrees))
  const { x, y, z } = point
  if (axis === "x") return { x, y: c * y - s * z, z: s * y + c * z }
  if (axis === "y") return { x: c * x + s * z, y, z: -s * x + c * z }
  return { x: c * x - s * y, y: s * x + c * y, z }
}

export function getKicadFootprintLocalModelTransform({
  position,
  rotation,
  origin,
  componentCenter,
  footprintRotation,
  boardSurfaceZ,
  footprintSide,
}: {
  position: Point3
  rotation: Point3
  origin: Point3
  componentCenter: { x: number; y: number }
  footprintRotation: number
  boardSurfaceZ: number
  footprintSide: "top" | "bottom"
}): { offset: Point3; rotation: Point3 } {
  // KiCad applies Rz(footprintRotation), then Ry(180) Rz(180) on B.Cu.
  // The latter is Rx(180). Undo these to express CAD placement locally.
  const toLocal = (point: Point3): Point3 => {
    const p = rotate(point, "z", -footprintRotation)
    return footprintSide === "bottom" ? { x: p.x, y: -p.y, z: -p.z } : p
  }
  // The renderer maps Circuit JSON Y/Z axes to scene Z/Y. Expressed back
  // in board coordinates, its rotation is Ry(-y) Rx(-x) Rz(z), so rotations
  // are applied to a point in Z, X, Y order before removing footprint placement.
  const modelToLocal = (point: Point3): Point3 =>
    toLocal(
      rotate(
        rotate(rotate(point, "z", rotation.z), "x", -rotation.x),
        "y",
        -rotation.y,
      ),
    )

  const x = modelToLocal({ x: 1, y: 0, z: 0 })
  const y = modelToLocal({ x: 0, y: 1, z: 0 })
  const z = modelToLocal({ x: 0, y: 0, z: 1 })
  // KiCad model rotations use Rz(-z) Ry(-y) Rx(-x).
  const singular = Math.hypot(x.x, x.y) < 1e-10
  const degrees = (angle: number) => {
    // Remove floating point residue at integral angles, including negative zero.
    return Math.round(((angle * 180) / Math.PI) * 1e10) / 1e10 || 0
  }
  const localRotation = {
    x: singular ? 0 : degrees(-Math.atan2(y.z, z.z)),
    y: degrees(Math.atan2(x.z, Math.hypot(x.x, x.y))),
    z: degrees(singular ? Math.atan2(y.x, y.y) : -Math.atan2(x.y, x.x)),
  }
  const localPosition = toLocal({
    x: position.x - componentCenter.x,
    y: position.y - componentCenter.y,
    z: position.z - boardSurfaceZ,
  })
  // The origin is subtracted before CAD rotation, not in world coordinates.
  const localOrigin = modelToLocal(origin)
  return {
    offset: {
      x: localPosition.x - localOrigin.x,
      y: localPosition.y - localOrigin.y,
      z: localPosition.z - localOrigin.z,
    },
    rotation: localRotation,
  }
}

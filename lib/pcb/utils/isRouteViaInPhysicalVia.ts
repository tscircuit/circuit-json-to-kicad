import type { PcbTraceRoutePointVia, PcbVia } from "circuit-json"
import { getKicadCopperLayerIndex, getKicadLayer } from "./layerMapping"

export function isRouteViaInPhysicalVia({
  physicalVia,
  routeVia,
  numLayers,
}: {
  physicalVia: PcbVia
  routeVia: PcbTraceRoutePointVia
  numLayers: number
}): boolean {
  if (physicalVia.x !== routeVia.x || physicalVia.y !== routeVia.y) return false
  if (
    routeVia.outer_diameter !== undefined &&
    routeVia.outer_diameter !== physicalVia.outer_diameter
  )
    return false
  if (
    routeVia.hole_diameter !== undefined &&
    routeVia.hole_diameter !== physicalVia.hole_diameter
  )
    return false

  // Copper indices use KiCad's fixed stack order (F.Cu = 0, B.Cu = 31).
  const indices = physicalVia.layers.map((layer) =>
    getKicadCopperLayerIndex(getKicadLayer(layer), numLayers),
  )
  const top = Math.min(...indices)
  const bottom = Math.max(...indices)
  return [routeVia.from_layer, routeVia.to_layer].every((layer) => {
    const index = getKicadCopperLayerIndex(getKicadLayer(layer), numLayers)
    return index >= top && index <= bottom
  })
}

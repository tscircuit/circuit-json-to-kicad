/**
 * Maps circuit-json layer names to KiCad layer names
 */
export const circuitJsonLayerToKicadLayer: Record<string, string> = {
  top: "F.Cu",
  bottom: "B.Cu",
  inner1: "In1.Cu",
  inner2: "In2.Cu",
  inner3: "In3.Cu",
  inner4: "In4.Cu",
  inner5: "In5.Cu",
  inner6: "In6.Cu",
  inner7: "In7.Cu",
  inner8: "In8.Cu",
}

/**
 * Get the KiCad layer name for a circuit-json layer
 */
export function getKicadLayer(circuitJsonLayer: string | undefined): string {
  if (!circuitJsonLayer) return "F.Cu"
  const mappedLayer = circuitJsonLayerToKicadLayer[circuitJsonLayer]
  if (mappedLayer) return mappedLayer

  const innerLayerMatch = circuitJsonLayer.match(/^inner(\d+)$/)
  if (innerLayerMatch?.[1]) return `In${innerLayerMatch[1]}.Cu`

  return circuitJsonLayer
}

/**
 * Get the KiCad 9 layer ordinal for a copper layer.
 *   - F.Cu = 0
 *   - B.Cu = 2
 *   - In<n>.Cu = 2 * n + 2 (In1.Cu = 4, In2.Cu = 6, ...)
 */
export function getKicadCopperLayerIndex(layerName: string): number {
  if (layerName === "F.Cu") return 0
  if (layerName === "B.Cu") return 2

  const match = layerName.match(/^In(\d+)\.Cu$/)
  if (match?.[1]) return 2 * parseInt(match[1], 10) + 2

  return 0
}

/**
 * Position of a copper layer in the stackup, front-most first. KiCad 9
 * ordinals are not in stackup order (B.Cu = 2 sits before the inner layers).
 */
function getCopperStackupPosition(layerName: string): number {
  if (layerName === "F.Cu") return 0
  if (layerName === "B.Cu") return Number.MAX_SAFE_INTEGER

  const match = layerName.match(/^In(\d+)\.Cu$/)
  if (match?.[1]) return parseInt(match[1], 10)

  return 0
}

/**
 * Get all via layers for the given number of copper layers
 * Vias typically span all copper layers
 */
export function getViaLayers(numLayers: number): string[] {
  const layers = ["F.Cu"]
  for (let i = 1; i < numLayers - 1; i++) {
    layers.push(`In${i}.Cu`)
  }
  layers.push("B.Cu")
  return layers
}

/**
 * A KiCad via spans exactly two copper layers: its top-most and bottom-most.
 * Given the copper layers a via touches, return that outermost pair in stackup
 * order (front-most first). Circuit JSON may list every traversed layer (e.g.
 * [F.Cu, In1.Cu, In2.Cu, B.Cu], which KiCad rejects) or the two span layers in
 * either order (e.g. [B.Cu, F.Cu]); both are normalized here.
 */
export function getViaLayerSpan(kicadLayers: string[]): string[] {
  if (kicadLayers.length <= 1) return kicadLayers

  let top = kicadLayers[0]!
  let bottom = kicadLayers[0]!
  let topIndex = getCopperStackupPosition(top)
  let bottomIndex = topIndex
  for (const layer of kicadLayers) {
    const index = getCopperStackupPosition(layer)
    if (index < topIndex) {
      topIndex = index
      top = layer
    }
    if (index > bottomIndex) {
      bottomIndex = index
      bottom = layer
    }
  }
  return top === bottom ? [top] : [top, bottom]
}

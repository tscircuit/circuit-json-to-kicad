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
}

/**
 * Get the KiCad layer name for a circuit-json layer
 */
export function getKicadLayer(circuitJsonLayer: string | undefined): string {
  if (!circuitJsonLayer) return "F.Cu"
  return (
    circuitJsonLayerToKicadLayer[circuitJsonLayer] || circuitJsonLayer || "F.Cu"
  )
}

/**
 * Get the KiCad copper layer index based on number of layers
 * For a 4-layer board:
 *   - F.Cu (front) = 0
 *   - In1.Cu = 1
 *   - In2.Cu = 2
 *   - B.Cu (back) = 31
 *
 * For a 2-layer board:
 *   - F.Cu (front) = 0
 *   - B.Cu (back) = 31
 */
export function getKicadCopperLayerIndex(
  layerName: string,
  numLayers: number,
): number {
  if (layerName === "F.Cu") return 0
  if (layerName === "B.Cu") return 31

  // Inner layers use sequential indices starting from 1
  const match = layerName.match(/^In(\d+)\.Cu$/)
  if (match?.[1]) {
    return parseInt(match[1], 10)
  }

  return 0
}

export function getCircuitJsonBoardLayers(numLayers: number): string[] {
  const layers = ["top"]
  for (let i = 1; i < numLayers - 1; i++) {
    layers.push(`inner${i}`)
  }
  layers.push("bottom")
  return layers
}

/**
 * Returns the physical stackup index for either circuit-json or KiCad copper
 * layer names. Unknown layers return -1 so callers can ignore them safely.
 */
export function getCircuitJsonLayerIndex(
  layerName: string,
  numLayers: number,
): number {
  const normalizedLayer = layerName
    .replace(/^F\.Cu$/, "top")
    .replace(/^B\.Cu$/, "bottom")
    .replace(/^In(\d+)\.Cu$/, "inner$1")
  return getCircuitJsonBoardLayers(numLayers).indexOf(normalizedLayer)
}

/**
 * Expands endpoint-style via layers into the full physical span through the
 * board stackup. For example, inner1 -> bottom on a 4-layer board becomes
 * [inner1, inner2, bottom].
 */
export function expandCircuitJsonViaSpan(
  layers: string[],
  numLayers: number,
): string[] {
  const indexes = layers
    .map((layer) => getCircuitJsonLayerIndex(layer, numLayers))
    .filter((index) => index >= 0)

  if (indexes.length < 2) {
    return layers
  }

  const startIndex = Math.min(...indexes)
  const endIndex = Math.max(...indexes)
  return getCircuitJsonBoardLayers(numLayers).slice(startIndex, endIndex + 1)
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

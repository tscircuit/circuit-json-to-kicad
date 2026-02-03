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

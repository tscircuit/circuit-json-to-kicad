import type { PcbSmtPad } from "circuit-json"
import { FootprintPad } from "kicadts"
/**
 * Creates a KiCad footprint pad from a circuit JSON SMT pad
 */
export function createSmdPadFromCircuitJson({
  pcbPad,
  componentCenter,
  padNumber,
}: {
  pcbPad: PcbSmtPad
  componentCenter: { x: number; y: number }
  padNumber: number
}): FootprintPad {
  if (!("x" in pcbPad && "y" in pcbPad)) {
    throw new Error("no support for polygon pads (or any pads w/o X/Y) yet")
  }

  // Calculate pad position relative to component center
  const relativeX = pcbPad.x - componentCenter.x
  const relativeY = -(pcbPad.y - componentCenter.y)

  // Map layer names
  const layerMap: Record<string, string> = {
    top: "F.Cu",
    bottom: "B.Cu",
  }
  const padLayer = layerMap[pcbPad.layer] || "F.Cu"

  // Handle different pad shapes (circle pads have radius, rect pads have width/height)
  const padShape = pcbPad.shape === "circle" ? "circle" : "rect"
  const padSize: [number, number] =
    pcbPad.shape === "circle"
      ? [
          "radius" in pcbPad ? pcbPad.radius * 2 : 0.5,
          "radius" in pcbPad ? pcbPad.radius * 2 : 0.5,
        ]
      : [
          "width" in pcbPad ? pcbPad.width : 0.5,
          "height" in pcbPad ? pcbPad.height : 0.5,
        ]

  return new FootprintPad({
    number: String(padNumber),
    padType: "smd",
    shape: padShape,
    at: [relativeX, relativeY, 0],
    size: padSize,
    layers: [
      `${padLayer}`,
      `${padLayer === "F.Cu" ? "F" : "B"}.Paste`,
      `${padLayer === "F.Cu" ? "F" : "B"}.Mask`,
    ],
    uuid: crypto.randomUUID(),
  })
}

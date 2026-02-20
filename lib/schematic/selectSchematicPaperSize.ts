export type PaperSize = "A0" | "A1" | "A2" | "A3" | "A4" | "A5"

export interface PaperDimensions {
  width: number // in mm
  height: number // in mm
  name: PaperSize
}

/**
 * Standard paper sizes in millimeters (landscape orientation)
 */
const PAPER_SIZES: PaperDimensions[] = [
  { name: "A5", width: 210, height: 148 },
  { name: "A4", width: 297, height: 210 },
  { name: "A3", width: 420, height: 297 },
  { name: "A2", width: 594, height: 420 },
  { name: "A1", width: 841, height: 594 },
  { name: "A0", width: 1189, height: 841 },
]

/**
 * Selects an appropriate paper size for a schematic based on its content bounds.
 * Adds padding around the content and selects the smallest paper size that fits.
 * A4 is the minimum default - will only scale up to larger sizes if content doesn't fit.
 *
 * @param contentWidth - Width of the schematic content in mm
 * @param contentHeight - Height of the schematic content in mm
 * @param paddingMm - Padding to add around content (default: 20mm)
 * @returns The selected paper size dimensions
 */
export function selectSchematicPaperSize(
  contentWidth: number,
  contentHeight: number,
  paddingMm = 20,
): PaperDimensions {
  const requiredWidth = contentWidth + 2 * paddingMm
  const requiredHeight = contentHeight + 2 * paddingMm

  // Find the smallest paper size that fits the content, starting from A4
  for (let i = 0; i < PAPER_SIZES.length; i++) {
    const paperSize = PAPER_SIZES[i]
    if (
      requiredWidth <= paperSize!.width &&
      requiredHeight <= paperSize!.height
    ) {
      return paperSize!
    }
  }

  // If even A0 is too small, return A0 (largest available)
  // In this case, content will be scaled down by the existing transform
  return PAPER_SIZES[PAPER_SIZES.length - 1]!
}

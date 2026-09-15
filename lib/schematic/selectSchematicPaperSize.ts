export type PaperSize = "A0" | "A1" | "A2" | "A3" | "A4" | "A5"

export interface PaperDimensions {
  /** Effective page width after orientation, in millimeters. */
  width: number
  /** Effective page height after orientation, in millimeters. */
  height: number
  name: PaperSize | string
  /** Raw custom dimensions written to KiCad's `(paper width height)` form. */
  customSize?: { width: number; height: number }
  /** Whether KiCad writes the page with its `portrait` flag. */
  isPortrait?: boolean
}

/**
 * Standard paper sizes in millimeters (landscape orientation)
 * Listed from smallest (A4) to largest (A0)
 * A4 is the minimum and default size
 */
export const PAPER_SIZES: PaperDimensions[] = [
  { name: "A4", width: 297, height: 210 },
  { name: "A3", width: 420, height: 297 },
  { name: "A2", width: 594, height: 420 },
  { name: "A1", width: 841, height: 594 },
  { name: "A0", width: 1189, height: 841 },
]

export const STANDARD_PAPER_DIMENSIONS_MM: Record<
  string,
  { width: number; height: number }
> = {
  A4: { width: 297, height: 210 },
  A3: { width: 420, height: 297 },
  A2: { width: 594, height: 420 },
  A1: { width: 841, height: 594 },
  A0: { width: 1189, height: 841 },
  A5: { width: 210, height: 148 },
}

/**
 * Selects an appropriate paper size for a schematic based on its content bounds.
 * Adds padding around the content and selects the smallest paper size that fits.
 *
 * Evaluation Order:
 * 1. Landscape standard ISO sizes (A4 to A0).
 * 2. If content cannot fit on landscape sheets (e.g. tall schematics or exceeding A0 landscape),
 *    evaluates portrait orientation for standard ISO sizes (A4 to A0).
 * 3. If content exceeds standard A0 in both landscape and portrait, selects a custom sheet
 *    dimensioned to fit the content and margins so drawing elements never silently clip.
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

  // 1. Find the smallest paper size that fits the content in landscape orientation, starting from A4
  for (let i = 0; i < PAPER_SIZES.length; i++) {
    const paperSize = PAPER_SIZES[i]!
    if (
      requiredWidth <= paperSize.width &&
      requiredHeight <= paperSize.height
    ) {
      return paperSize
    }
  }

  // 2. If landscape doesn't fit, check portrait orientation starting from smallest standard size
  for (let i = 0; i < PAPER_SIZES.length; i++) {
    const std = PAPER_SIZES[i]!
    const portraitWidth = std.height
    const portraitHeight = std.width
    if (requiredWidth <= portraitWidth && requiredHeight <= portraitHeight) {
      return {
        name: std.name,
        width: portraitWidth,
        height: portraitHeight,
        isPortrait: true,
      }
    }
  }

  // 3. If even A0 in both landscape and portrait is too small, choose a custom sheet
  // so content never silently clips.
  const customWidth = Math.ceil(requiredWidth)
  const customHeight = Math.ceil(requiredHeight)
  return {
    name: "Custom",
    width: customWidth,
    height: customHeight,
    customSize: { width: customWidth, height: customHeight },
    isPortrait: customHeight > customWidth,
  }
}

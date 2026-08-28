import {
  selectSchematicPaperSize,
  type PaperDimensions,
} from "./selectSchematicPaperSize"

const DEFAULT_CONTENT_MARGIN_MM = 20
const KICAD_TITLE_BLOCK_HEIGHT_MM = 44
const TITLE_BLOCK_CLEARANCE_MM = 5

interface SchematicPageLayoutOptions {
  contentWidthMm: number
  contentHeightMm: number
  extraPaperExtentMm?: { width: number; height: number }
}

interface SchematicPageLayout {
  contentCenter: { x: number; y: number }
  paperSize: PaperDimensions
}

/**
 * Select a page and place its content without entering KiCad's title block.
 *
 * KiCad reserves the bottom-right 44 mm of every ISO drawing sheet for the
 * title block. Centering tall content on the entire page can therefore put
 * valid symbols and wires through that block even when the selected paper size
 * has enough room. Reserve the title-block band while selecting the page, then
 * shift content upward only when its centered bounds would enter that band.
 */
export function getSchematicPageLayout({
  contentWidthMm,
  contentHeightMm,
  extraPaperExtentMm,
}: SchematicPageLayoutOptions): SchematicPageLayout {
  const requiredWidthMm = Math.max(
    contentWidthMm + 2 * DEFAULT_CONTENT_MARGIN_MM,
    extraPaperExtentMm?.width ?? 0,
  )
  const requiredHeightMm = Math.max(
    contentHeightMm +
      DEFAULT_CONTENT_MARGIN_MM +
      KICAD_TITLE_BLOCK_HEIGHT_MM +
      TITLE_BLOCK_CLEARANCE_MM,
    extraPaperExtentMm?.height ?? 0,
  )
  const paperSize = selectSchematicPaperSize(
    requiredWidthMm,
    requiredHeightMm,
    0,
  )

  const centeredY = paperSize.height / 2
  const lowestSafeCenterY =
    paperSize.height -
    KICAD_TITLE_BLOCK_HEIGHT_MM -
    TITLE_BLOCK_CLEARANCE_MM -
    contentHeightMm / 2

  return {
    paperSize,
    contentCenter: {
      x: paperSize.width / 2,
      y: Math.min(centeredY, lowestSafeCenterY),
    },
  }
}

import sharp from "sharp"

const SCHEMATIC_COMPARISON_PANEL_WIDTH = 1200
const SCHEMATIC_COMPARISON_PANEL_HEIGHT = 600
const SCHEMATIC_COMPARISON_CONTENT_PADDING = 48
const SCHEMATIC_COMPARISON_BACKGROUND = {
  r: 245,
  g: 241,
  b: 237,
  alpha: 1,
}
const KICAD_DRAWING_SHEET_HORIZONTAL_CROP_RATIO = 0.12
const KICAD_DRAWING_SHEET_TOP_CROP_RATIO = 0.14
const KICAD_DRAWING_SHEET_BOTTOM_CROP_RATIO = 0.24

async function fitSchematicContentToComparisonPanel(
  schematicPng: Buffer,
): Promise<Buffer> {
  const trimmedPng = await sharp(schematicPng)
    .trim({ threshold: 10 })
    .toBuffer()
  const metadata = await sharp(trimmedPng).metadata()
  const contentWidth = Math.max(metadata.width ?? 1, 1)
  const contentHeight = Math.max(metadata.height ?? 1, 1)
  const availableWidth =
    SCHEMATIC_COMPARISON_PANEL_WIDTH - SCHEMATIC_COMPARISON_CONTENT_PADDING * 2
  const availableHeight =
    SCHEMATIC_COMPARISON_PANEL_HEIGHT - SCHEMATIC_COMPARISON_CONTENT_PADDING * 2
  const scale = Math.min(
    availableWidth / contentWidth,
    availableHeight / contentHeight,
  )
  const resizedWidth = Math.max(1, Math.round(contentWidth * scale))
  const resizedHeight = Math.max(1, Math.round(contentHeight * scale))
  const resizedPng = await sharp(trimmedPng)
    .resize(resizedWidth, resizedHeight, { fit: "fill" })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: SCHEMATIC_COMPARISON_PANEL_WIDTH,
      height: SCHEMATIC_COMPARISON_PANEL_HEIGHT,
      channels: 4,
      background: SCHEMATIC_COMPARISON_BACKGROUND,
    },
  })
    .composite([
      {
        input: resizedPng,
        left: Math.round((SCHEMATIC_COMPARISON_PANEL_WIDTH - resizedWidth) / 2),
        top: Math.round(
          (SCHEMATIC_COMPARISON_PANEL_HEIGHT - resizedHeight) / 2,
        ),
      },
    ])
    .png()
    .toBuffer()
}

async function removeKicadDrawingSheetFromComparison(
  kicadPng: Buffer,
): Promise<Buffer> {
  const metadata = await sharp(kicadPng).metadata()
  const width = Math.max(metadata.width ?? 1, 1)
  const height = Math.max(metadata.height ?? 1, 1)
  const left = Math.round(width * KICAD_DRAWING_SHEET_HORIZONTAL_CROP_RATIO)
  const top = Math.round(height * KICAD_DRAWING_SHEET_TOP_CROP_RATIO)
  const extractedWidth = Math.max(1, width - left * 2)
  const extractedHeight = Math.max(
    1,
    height - top - Math.round(height * KICAD_DRAWING_SHEET_BOTTOM_CROP_RATIO),
  )

  return sharp(kicadPng)
    .extract({ left, top, width: extractedWidth, height: extractedHeight })
    .png()
    .toBuffer()
}

export async function createFocusedSchematicComparisonPanels({
  circuitJsonPng,
  kicadPng,
}: {
  circuitJsonPng: Buffer
  kicadPng: Buffer
}): Promise<{ circuitJsonPanel: Buffer; kicadPanel: Buffer }> {
  const circuitJsonPanel =
    await fitSchematicContentToComparisonPanel(circuitJsonPng)
  const kicadContentPng = await removeKicadDrawingSheetFromComparison(kicadPng)
  const kicadPanel = await fitSchematicContentToComparisonPanel(kicadContentPng)
  return { circuitJsonPanel, kicadPanel }
}

async function stackLabeledComparisonPngs(
  circuitJsonPng: Buffer,
  kicadPng: Buffer,
): Promise<Buffer> {
  const labelFontSize = 24
  const labelPadding = 8
  const circuitJsonMetadata = await sharp(circuitJsonPng).metadata()
  const kicadMetadata = await sharp(kicadPng).metadata()
  const circuitJsonWidth = circuitJsonMetadata.width ?? 0
  const circuitJsonHeight = circuitJsonMetadata.height ?? 0
  const kicadWidth = kicadMetadata.width ?? 0
  const kicadHeight = kicadMetadata.height ?? 0
  const width = Math.max(circuitJsonWidth, kicadWidth)
  const height = circuitJsonHeight + kicadHeight

  const createLabel = (text: string) => {
    const textWidth = text.length * labelFontSize * 0.6
    const boxWidth = textWidth + labelPadding * 2
    const boxHeight = labelFontSize + labelPadding * 2

    return Buffer.from(`
      <svg width="${boxWidth}" height="${boxHeight}">
        <rect width="100%" height="100%" fill="black"/>
        <text x="${labelPadding}" y="${labelPadding + labelFontSize * 0.8}"
          font-family="Arial, sans-serif"
          font-size="${labelFontSize}"
          font-weight="bold"
          fill="white">
          ${text}
        </text>
      </svg>
    `)
  }

  const cjLabel = createLabel("Circuit JSON")
  const kicadLabel = createLabel("KiCad")

  const compositeOps = [
    {
      input: circuitJsonPng,
      left: Math.floor((width - circuitJsonWidth) / 2),
      top: 0,
    },
    {
      input: kicadPng,
      left: Math.floor((width - kicadWidth) / 2),
      top: circuitJsonHeight,
    },
    {
      input: await sharp(cjLabel).png().toBuffer(),
      left: 0,
      top: 0,
    },
    {
      input: await sharp(kicadLabel).png().toBuffer(),
      left: 0,
      top: circuitJsonHeight,
    },
  ]

  const result = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(compositeOps)
    .png()
    .toBuffer()

  return result
}

export const stackCircuitJsonKicadPngs = stackLabeledComparisonPngs

export const stackSchematicCircuitJsonKicadPngs = async (
  circuitJsonPng: Buffer,
  kicadPng: Buffer,
): Promise<Buffer> => {
  const { circuitJsonPanel, kicadPanel } =
    await createFocusedSchematicComparisonPanels({
      circuitJsonPng,
      kicadPng,
    })
  return stackLabeledComparisonPngs(circuitJsonPanel, kicadPanel)
}

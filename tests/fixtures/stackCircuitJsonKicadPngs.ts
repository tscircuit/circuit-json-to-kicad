import sharp from "sharp"

const SCHEMATIC_COMPARISON_CONTENT_PADDING = 48
const SCHEMATIC_COMPARISON_BACKGROUND = {
  r: 245,
  g: 241,
  b: 237,
  alpha: 1,
}

async function cropSchematicToContent(schematicPng: Buffer): Promise<Buffer> {
  return sharp(schematicPng)
    .trim({ threshold: 10 })
    .flatten({ background: SCHEMATIC_COMPARISON_BACKGROUND })
    .extend({
      top: SCHEMATIC_COMPARISON_CONTENT_PADDING,
      right: SCHEMATIC_COMPARISON_CONTENT_PADDING,
      bottom: SCHEMATIC_COMPARISON_CONTENT_PADDING,
      left: SCHEMATIC_COMPARISON_CONTENT_PADDING,
      background: SCHEMATIC_COMPARISON_BACKGROUND,
    })
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
  const circuitJsonPanel = await cropSchematicToContent(circuitJsonPng)
  const kicadPanel = await cropSchematicToContent(kicadPng)
  return { circuitJsonPanel, kicadPanel }
}

async function stackLabeledComparisonPngs(
  circuitJsonPng: Buffer,
  kicadPng: Buffer,
  background = { r: 255, g: 255, b: 255, alpha: 1 },
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
      background,
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
  return stackLabeledComparisonPngs(
    circuitJsonPanel,
    kicadPanel,
    SCHEMATIC_COMPARISON_BACKGROUND,
  )
}

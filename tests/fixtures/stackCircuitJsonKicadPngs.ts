import sharp from "sharp"

export const stackCircuitJsonKicadPngs = async (
  circuitJsonPng: Buffer,
  kicadPng: Buffer,
): Promise<Buffer> => {
  const labelFontSize = 24
  const labelPadding = 8

  // Get metadata for both images
  const [cjMetadata, kicadMetadata] = await Promise.all([
    sharp(circuitJsonPng).metadata(),
    sharp(kicadPng).metadata(),
  ])

  const cjWidth = cjMetadata.width || 0
  const cjHeight = cjMetadata.height || 0
  const kicadWidth = kicadMetadata.width || 0
  const kicadHeight = kicadMetadata.height || 0

  // Calculate canvas dimensions
  const maxWidth = Math.max(cjWidth, kicadWidth)
  const totalHeight = cjHeight + kicadHeight

  // Create text labels as SVG with black background and white text
  const createLabel = (text: string) => {
    // Approximate text width (rough estimate)
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

  // Create composite operations - images first, then labels on top
  const compositeOps = [
    {
      input: await sharp(circuitJsonPng).toBuffer(),
      left: Math.floor((maxWidth - cjWidth) / 2),
      top: 0,
    },
    {
      input: await sharp(kicadPng).toBuffer(),
      left: Math.floor((maxWidth - kicadWidth) / 2),
      top: cjHeight,
    },
    {
      input: await sharp(cjLabel).png().toBuffer(),
      left: 0,
      top: 0,
    },
    {
      input: await sharp(kicadLabel).png().toBuffer(),
      left: 0,
      top: cjHeight,
    },
  ]

  // Create a blank canvas and composite all elements
  const result = await sharp({
    create: {
      width: maxWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(compositeOps)
    .png()
    .toBuffer()

  return result
}

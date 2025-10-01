import sharp from "sharp"

export const stackCircuitJsonKicadPngs = async (
  circuitJsonPng: Buffer,
  kicadPng: Buffer,
): Promise<Buffer> => {
  const labelHeight = 40
  const labelFontSize = 24

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
  const totalHeight = labelHeight + cjHeight + labelHeight + kicadHeight

  // Create text labels as SVG
  const createLabel = (text: string, width: number) => {
    return Buffer.from(`
      <svg width="${width}" height="${labelHeight}">
        <text x="50%" y="50%"
          font-family="Arial, sans-serif"
          font-size="${labelFontSize}"
          font-weight="bold"
          fill="black"
          text-anchor="middle"
          dominant-baseline="middle">
          ${text}
        </text>
      </svg>
    `)
  }

  const cjLabel = createLabel("Circuit JSON", maxWidth)
  const kicadLabel = createLabel("KiCad", maxWidth)

  // Create composite operations
  const compositeOps = [
    {
      input: await sharp(cjLabel).png().toBuffer(),
      left: 0,
      top: 0,
    },
    {
      input: await sharp(circuitJsonPng).toBuffer(),
      left: Math.floor((maxWidth - cjWidth) / 2),
      top: labelHeight,
    },
    {
      input: await sharp(kicadLabel).png().toBuffer(),
      left: 0,
      top: labelHeight + cjHeight,
    },
    {
      input: await sharp(kicadPng).toBuffer(),
      left: Math.floor((maxWidth - kicadWidth) / 2),
      top: labelHeight + cjHeight + labelHeight,
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

import sharp from "sharp"

export const stackPngsVertically = async (pngs: Buffer[]): Promise<Buffer> => {
  if (pngs.length === 0) {
    throw new Error("No PNGs provided to stack")
  }

  if (pngs.length === 1) {
    return pngs[0]!
  }

  // Get metadata for all images to determine dimensions
  const metadataList = await Promise.all(
    pngs.map(async (png) => await sharp(png).metadata()),
  )

  // Calculate the maximum width and total height
  const maxWidth = Math.max(...metadataList.map((m) => m.width || 0))
  const totalHeight = metadataList.reduce((sum, m) => sum + (m.height || 0), 0)

  // Create composite operations - stack images vertically
  let currentY = 0
  const compositeOps = await Promise.all(
    pngs.map(async (png, index) => {
      const metadata = metadataList[index]!
      const width = metadata.width || 0
      const height = metadata.height || 0

      // Center horizontally if image is narrower than max width
      const left = Math.floor((maxWidth - width) / 2)
      const top = currentY

      currentY += height

      return {
        input: await sharp(png).toBuffer(),
        left,
        top,
      }
    }),
  )

  // Create a blank canvas and composite all images
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

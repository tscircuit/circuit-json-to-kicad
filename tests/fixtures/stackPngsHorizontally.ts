import sharp, { type Metadata } from "sharp"

export const stackPngsHorizontally = async (
  pngs: Buffer[],
): Promise<Buffer> => {
  if (pngs.length === 0) {
    throw new Error("No PNGs provided to stack")
  }

  if (pngs.length === 1) {
    return pngs[0]!
  }

  const metadata: Metadata[] = []
  for (const png of pngs) {
    metadata.push(await sharp(png).metadata())
  }

  const width = metadata.reduce(
    (sum, imageMetadata) => sum + (imageMetadata.width ?? 0),
    0,
  )
  const height = Math.max(
    ...metadata.map((imageMetadata) => imageMetadata.height ?? 0),
  )

  let left = 0
  const composite = pngs.map((png, index) => {
    const imageMetadata = metadata[index]!
    const imageWidth = imageMetadata.width ?? 0
    const operation = {
      input: png,
      left,
      top: 0,
    }
    left += imageWidth
    return operation
  })

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(composite)
    .png()
    .toBuffer()
}

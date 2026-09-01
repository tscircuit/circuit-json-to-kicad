type SvgSize = {
  height: number
  width: number
}

function readSvgSize(svg: string): SvgSize {
  const rootTag = svg.match(/<svg\b[^>]*>/u)?.[0]
  if (!rootTag) throw new Error("Expected an SVG root element")

  const width = Number(rootTag.match(/\bwidth=["']([\d.]+)["']/u)?.[1])
  const height = Number(rootTag.match(/\bheight=["']([\d.]+)["']/u)?.[1])
  if (!(width > 0) || !(height > 0)) {
    throw new Error("Expected positive numeric SVG width and height")
  }

  return { height, width }
}

function toSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}

export function createSideBySideSvg(
  sourceSvg: string,
  roundTripSvg: string,
): string {
  const sourceSize = readSvgSize(sourceSvg)
  const roundTripSize = readSvgSize(roundTripSvg)
  const width = sourceSize.width + roundTripSize.width
  const height = Math.max(sourceSize.height, roundTripSize.height)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image x="0" y="0" width="${sourceSize.width}" height="${sourceSize.height}" href="${toSvgDataUrl(sourceSvg)}"/>
  <image x="${sourceSize.width}" y="0" width="${roundTripSize.width}" height="${roundTripSize.height}" href="${toSvgDataUrl(roundTripSvg)}"/>
</svg>`
}

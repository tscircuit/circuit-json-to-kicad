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

function positionNestedSvg(svg: string, x: number): string {
  const start = svg.indexOf("<svg")
  const end = svg.lastIndexOf("</svg>")
  if (start === -1 || end === -1) {
    throw new Error("Expected a complete SVG document")
  }
  const nestedSvg = svg.slice(start, end + "</svg>".length)
  return nestedSvg.replace("<svg", `<svg x="${x}" y="0"`)
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
  <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
  ${positionNestedSvg(sourceSvg, 0)}
  ${positionNestedSvg(roundTripSvg, sourceSize.width)}
</svg>`
}

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

function positionNestedSvg(
  svg: string,
  comparison: "source" | "converted",
  x: number,
): string {
  const svgStart = svg.indexOf("<svg")
  const svgEnd = svg.lastIndexOf("</svg>")
  if (svgStart === -1 || svgEnd === -1) {
    throw new Error("Expected a complete SVG root element")
  }

  return svg
    .slice(svgStart, svgEnd + "</svg>".length)
    .replace("<svg", `<svg data-comparison="${comparison}" x="${x}" y="0"`)
}

export function createSideBySideSvg(
  sourceSvg: string,
  convertedSvg: string,
): string {
  const sourceSize = readSvgSize(sourceSvg)
  const convertedSize = readSvgSize(convertedSvg)
  const width = sourceSize.width + convertedSize.width
  const height = Math.max(sourceSize.height, convertedSize.height)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${positionNestedSvg(sourceSvg, "source", 0)}
${positionNestedSvg(convertedSvg, "converted", sourceSize.width)}
</svg>`
}

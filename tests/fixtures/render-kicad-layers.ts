import { takeKicadSnapshot } from "./take-kicad-snapshot"

/** Stack native KiCad plots of the exported board in physical layer order. */
export async function renderKicadLayers(
  kicadFileContent: string,
  caption: string,
) {
  const layers = ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"]
  const panels: string[] = []
  for (const [index, layer] of layers.entries()) {
    const { generatedFileContent } = await takeKicadSnapshot({
      kicadFileContent,
      kicadFileType: "pcb",
      pcbLayers: [layer, "Edge.Cuts"],
      generatePng: false,
    })
    const svg = generatedFileContent["temp_file.svg"]!.toString()
    const plot = svg
      .slice(svg.indexOf("<svg"))
      .replace(/<title>.*?<\/title>/, `<title>${layer}</title>`)
      .replace(/width="[^"]+"/, 'width="760"')
      .replace(/height="[^"]+"/, 'height="530"')
      .replace("<svg", '<svg x="20" y="30"')
    panels.push(
      `<g transform="translate(0 ${40 + index * 580})"><text x="20" y="20">${layer}</text><rect x="20" y="30" width="760" height="530" fill="black"/>${plot}</g>`,
    )
  }
  const height = 40 + layers.length * 580
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}"><rect width="800" height="${height}" fill="white"/><g font-family="sans-serif" font-size="16" fill="#222"><text x="20" y="26">${caption.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</text>${panels.join("")}</g></svg>`
}

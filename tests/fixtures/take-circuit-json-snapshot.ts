import type { CircuitJson } from "circuit-json"
import {
  convertCircuitJsonToSchematicSvg,
  convertCircuitJsonToPcbSvg,
} from "circuit-to-svg"
import sharp from "sharp"

export const takeCircuitJsonSnapshot = async (params: {
  circuitJson: CircuitJson
  outputType: "pcb" | "schematic"
  pcbOptions?: Parameters<typeof convertCircuitJsonToPcbSvg>[1]
}): Promise<Buffer> => {
  const { circuitJson, outputType } = params
  if (outputType === "schematic") {
    const svg = await convertCircuitJsonToSchematicSvg(circuitJson)
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    return png
  }
  if (outputType === "pcb") {
    const svg = await convertCircuitJsonToPcbSvg(circuitJson, {
      showCourtyards: true,
      ...params.pcbOptions,
    })
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    return png
  }
  throw new Error(`Unknown output type: ${outputType}`)
}

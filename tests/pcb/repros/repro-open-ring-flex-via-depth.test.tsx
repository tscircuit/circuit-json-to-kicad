import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

// Original pcb_via_356 and six nearby FLASH_OUT trace points from open-ring-flex.
const viaPosition = { x: 24.070511127433875, y: -0.5365261919200276 }
const flashOutRoute = (
  [
    [23.81550726874614, -0.535598126523328],
    [23.92795397675735, -0.5208275489273755],
    [24.052674980749813, -0.518156867497449],
    [24.091606251008805, -0.5437335493545649],
    [24.183811810969026, -0.6234977388360725],
    [24.22523087817108, -0.7370243251938462],
  ] as const
).map(([x, y]) => ({
  route_type: "wire" as const,
  x: x - viaPosition.x,
  y: y - viaPosition.y,
  width: 0.075,
  layer: "bottom" as const,
}))

const Example = () => (
  <board width={1.4} height={1.2} layers={4} thickness={0.22} schematicDisabled>
    <net name="GND" />
    <via
      name="VGND"
      pcbX={0}
      pcbY={0}
      fromLayer="top"
      toLayer="inner1"
      outerDiameter={0.2}
      holeDiameter={0.1}
      connectsTo="net.GND"
    />
    <pcbtrace layer="bottom" thickness={0.075} route={flashOutRoute} />
  </board>
)

export default Example

test("repro: open-ring-flex blind via appears on bottom copper", async () => {
  const circuit = new Circuit()
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "pcb",
    pcbLayers: ["B.Cu", "Edge.Cuts"],
    pcbDrillHoleColor: "white",
    generatePng: false,
  })
  const circuitJsonPng = await sharp(
    Buffer.from(
      convertCircuitJsonToPcbSvg(circuitJson, {
        layer: "bottom",
        hiddenLayerOpacity: 0,
        drawPaddingOutsideBoard: false,
        width: 800,
        height: 686,
      }),
    ),
  )
    .png()
    .toBuffer()
  const kicadPng = await sharp(snapshot.generatedFileContent["temp_file.svg"]!)
    .resize({ width: 800 })
    .flatten({ background: "#000" })
    .png()
    .toBuffer()
  await expect(
    stackCircuitJsonKicadPngs(circuitJsonPng, kicadPng),
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)

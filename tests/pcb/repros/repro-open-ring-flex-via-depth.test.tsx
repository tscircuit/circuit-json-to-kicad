import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { parseKicadPcb } from "kicadts"
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

const ReproOpenRingFlexViaDepth = () => (
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

export default ReproOpenRingFlexViaDepth

test("repro: open-ring-flex blind via appears on bottom copper", async () => {
  const circuit = new Circuit()
  circuit.add(<ReproOpenRingFlexViaDepth />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const sourceVias = circuitJson.filter((element) => element.type === "pcb_via")
  expect(sourceVias).toHaveLength(1)
  expect(sourceVias[0]).toMatchObject({
    layers: ["top", "inner1"],
    outer_diameter: 0.2,
    hole_diameter: 0.1,
  })
  expect(
    circuitJson.find((element) => element.type === "pcb_trace")?.route,
  ).toEqual(flashOutRoute)
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  // Preserve the blind type and keep this top-to-inner1 via off bottom copper.
  expect(
    parseKicadPcb(output).vias.map((via) => ({
      type: via.type ?? null,
      layers: via.layers?.names,
      diameter: via.size,
      drill: via.drill,
    })),
  ).toMatchSnapshot()

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
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
        includeVersion: false,
        showCourtyards: false,
      }),
    ),
  )
    .png()
    .toBuffer()
  expect(snapshot.exitCode).toBe(0)
  const kicadPng = await sharp(snapshot.generatedFileContent["temp_file.svg"]!)
    .resize({ width: 800 })
    .flatten({ background: "#000" })
    .png()
    .toBuffer()
  await expect(
    stackCircuitJsonKicadPngs(circuitJsonPng, kicadPng),
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)

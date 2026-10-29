import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import type { PcbSolderPaste } from "circuit-json"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const CustomSolderPasteApertures = () => (
  <board width="32mm" height="18mm" routingDisabled schematicDisabled>
    <chip
      name="U_LINKED"
      pcbX={-9}
      footprint={
        <footprint>
          <smtpad
            shape="rect"
            width={4}
            height={3}
            solderPasteMargin={-0.5}
            portHints={["1"]}
          />
        </footprint>
      }
    />

    <chip
      name="U_WINDOWED"
      pcbX={2}
      footprint={
        <footprint>
          <smtpad
            shape="rect"
            width={5}
            height={5}
            noSolderPaste
            portHints={["1"]}
          />
          <solderpaste
            shape="rect"
            width={1.5}
            height={1.5}
            pcbX={-1}
            pcbY={-1}
          />
          <solderpaste
            shape="rect"
            width={1.5}
            height={1.5}
            pcbX={1}
            pcbY={-1}
          />
          <solderpaste
            shape="rect"
            width={1.5}
            height={1.5}
            pcbX={-1}
            pcbY={1}
          />
          <solderpaste
            shape="rect"
            width={1.5}
            height={1.5}
            pcbX={1}
            pcbY={1}
          />
        </footprint>
      }
    />

    <solderpaste shape="circle" radius={1} pcbX={11} />

    <silkscreentext text="SHRUNK" pcbX={-9} pcbY={4} fontSize={0.65} />
    <silkscreentext text="4 WINDOWS" pcbX={2} pcbY={4} fontSize={0.65} />
    <silkscreentext text="STANDALONE" pcbX={11} pcbY={4} fontSize={0.65} />
  </board>
)

test("repro37: custom solder-paste aperture geometry is lost", async () => {
  const circuit = new Circuit()
  circuit.add(<CustomSolderPasteApertures />)
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const sourcePaste = circuitJson.filter(
    (element): element is PcbSolderPaste => element.type === "pcb_solder_paste",
  )
  expect(sourcePaste).toHaveLength(6)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = KicadPcb.parse(output)[0] as KicadPcb
  const exportedPastePads = pcb.footprints.flatMap((footprint) =>
    footprint.fpPads.filter((pad) =>
      pad.layers?.layers.some((layer) => layer.endsWith(".Paste")),
    ),
  )

  // The source has six explicit paste apertures. The current export keeps only
  // the linked pad's paste flag, expands it to the copper-pad size, and drops
  // the four window apertures plus the standalone circular aperture.
  expect(exportedPastePads).toHaveLength(1)
  expect(exportedPastePads[0]?.size?.width).toBe(4)
  expect(exportedPastePads[0]?.size?.height).toBe(3)

  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    width: 900,
    height: 500,
    includeVersion: false,
    showCourtyards: false,
    showSolderPaste: true,
    colorOverrides: {
      copper: { top: "transparent", bottom: "transparent" },
    },
  })
  const circuitJsonSnapshot = await sharp(Buffer.from(circuitJsonSvg))
    .png()
    .toBuffer()
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    generatePng: false,
    pcbLayers: ["F.Paste", "F.SilkS", "Edge.Cuts"],
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  await expect(
    stackCircuitJsonKicadPngs(
      circuitJsonSnapshot,
      await sharp(kicadSnapshot.generatedFileContent["temp_file.svg"]!)
        .resize({ width: 900 })
        .flatten({ background: "black" })
        .png()
        .toBuffer(),
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 120_000)

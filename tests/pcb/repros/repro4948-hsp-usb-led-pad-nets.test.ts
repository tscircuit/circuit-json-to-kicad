import { expect, test } from "bun:test"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { type KicadPcb, parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"
import { createSideBySideSvg } from "../../fixtures/create-side-by-side-svg"
import { expectOpenSourceSvgSnapshot } from "../../fixtures/create-open-source-schematic-svg-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro4948: HSP USB LED loses pad nets on export", async () => {
  const source = await Bun.file(
    new URL("../../../references/hsp-usb-led.kicad_pcb", import.meta.url),
  ).text()
  const importer = new KicadToCircuitJsonConverter()
  importer.addFile("hsp-usb-led.kicad_pcb", source)
  importer.runUntilFinished()
  const circuitJson = importer.getOutput()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  // Keep duplicate entries for the USB shield and switch's repeated lands.
  const getPadNets = (pcb: KicadPcb) =>
    pcb.footprints
      .flatMap((footprint) => {
        const reference = footprint.properties.find(
          (property) => property.key === "Reference",
        )!.value
        return footprint.fpPads.map(
          (pad) =>
            [`${reference}.${pad.number}`, pad.net?.name || null] as const,
        )
      })
      .sort(([a], [b]) => a.localeCompare(b))
  const sourcePads = getPadNets(parseKicadPcb(source))
  const outputPads = getPadNets(parseKicadPcb(output))
  expect(sourcePads).toHaveLength(22)
  expect(sourcePads.every(([, net]) => net !== null)).toBe(true)
  expect(outputPads).toEqual(sourcePads.map(([pad]) => [pad, null]))

  const [sourceSvg, outputSvg] = await Promise.all(
    [source, output].map(async (kicadFileContent) => {
      const snapshot = await takeKicadSnapshot({
        kicadFileContent,
        kicadFileType: "pcb",
        generatePng: false,
        pcbDrillHoleColor: "white",
        pcbCopperPourOpacity: 0.35,
      })
      return (
        snapshot.generatedFileContent["temp_file.svg"]!.toString("utf8")
          .replace(
            / date \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} /u,
            " date normalized ",
          )
          .replace(/[ \t]+$/gmu, "")
          // Normalize viewport units before composing the two native SVGs.
          .replace(
            /width="([\d.]+)mm"\s+height="([\d.]+)mm"/u,
            (_, width, height) =>
              `width="600" height="${(600 * Number(height)) / Number(width)}"`,
          )
      )
    }),
  )
  const comparison = createSideBySideSvg(sourceSvg!, outputSvg!).replace(
    /(<svg[^>]*>)/u,
    '$1<rect width="100%" height="100%" fill="#101820"/>',
  )
  await expectOpenSourceSvgSnapshot(comparison, import.meta.path)
}, 120000)

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
  const sourcePcb = parseKicadPcb(source)
  const outputPcb = parseKicadPcb(output)
  const sourcePads = getPadNets(sourcePcb)
  const outputPads = getPadNets(outputPcb)
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
  const comparison = createSideBySideSvg(sourceSvg!, outputSvg!)
  const height = Number(comparison.match(/height="([\d.]+)"/u)![1])
  const sourceAssigned = sourcePads.filter(([, net]) => net !== null).length
  const outputAssigned = outputPads.filter(([, net]) => net !== null).length
  const outputColor =
    outputAssigned === outputPads.length ? "#8fd6a7" : "#ff9b9b"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height + 90}" viewBox="0 0 1200 ${height + 90}">
<rect width="100%" height="100%" fill="#101820"/>
<g font-family="sans-serif">
<text x="18" y="28" fill="white" font-size="20">HSP USB LED — original KiCad</text>
<text x="618" y="28" fill="white" font-size="20">Current KiCad round trip</text>
<text x="18" y="52" fill="#8fd6a7" font-size="16">${sourceAssigned}/${sourcePads.length} physical pads have assigned nets</text>
<text x="618" y="52" fill="${outputColor}" font-size="16">${outputAssigned}/${outputPads.length} physical pads have assigned nets</text>
<text x="18" y="74" fill="#b8c5d0" font-size="14">${sourcePcb.nets.filter((net) => net.id !== 0).length} net definitions</text>
<text x="618" y="74" fill="#b8c5d0" font-size="14">${outputPcb.nets.filter((net) => net.id !== 0).length} net definitions</text>
</g>
${comparison.replace("<svg", '<svg x="0" y="90"')}
</svg>`
  await expectOpenSourceSvgSnapshot(svg, import.meta.path)
}, 120000)

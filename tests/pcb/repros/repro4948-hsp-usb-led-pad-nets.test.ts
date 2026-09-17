import { expect, test } from "bun:test"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { type KicadPcb, parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"
import { createSideBySideSvg } from "../../fixtures/create-side-by-side-svg"
import { expectOpenSourceSvgSnapshot } from "../../fixtures/create-open-source-schematic-svg-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro4948: HSP USB LED preserves pad nets on export", async () => {
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
  // KiCad net names are normalized by the importer.
  const netNames: Record<string, string> = {
    GND: "GND",
    "Net-(D1-A)": "Net_D1_A",
    "Net-(J1-CC1)": "Net_J1_CC1",
    "Net-(J1-CC2)": "Net_J1_CC2",
    "Net-(J1-VBUS-PadA9)": "Net_J1_VBUS_PadA9",
    "Net-(R1-Pad1)": "Net_R1_Pad1",
  }
  const expectedPads = sourcePads.map(
    ([pad, net]) => [pad, netNames[net!]!] as const,
  )
  expect(outputPads).toEqual(expectedPads)

  const cc1Port = circuitJson
    .filter((e) => e.type === "source_port")
    .find((port) => port.name === "A5")!
  const traces = circuitJson.filter((e) => e.type === "source_trace")
  traces
    .find((trace) => trace.display_name === "GND")!
    .connected_source_port_ids.push(cc1Port.source_port_id)
  expect(() =>
    new CircuitJsonToKicadPcbConverter(circuitJson).runUntilFinished(),
  ).toThrow(/J1 pad A5: multiple KiCad nets \((?=.*GND)(?=.*Net_J1_CC1)/)

  for (const trace of traces) {
    trace.connected_source_port_ids = trace.connected_source_port_ids.filter(
      (id) => id !== cc1Port.source_port_id,
    )
  }
  const unassigned = new CircuitJsonToKicadPcbConverter(circuitJson)
  unassigned.runUntilFinished()
  expect(getPadNets(parseKicadPcb(unassigned.getOutputString()))).toEqual(
    expectedPads.map(([pad, net]) => [pad, pad === "J1.A5" ? null : net]),
  )

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

import { expect, test } from "bun:test"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { type KicadPcb, parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"
import { createSideBySideSvg } from "../../fixtures/create-side-by-side-svg"
import { expectOpenSourceSvgSnapshot } from "../../fixtures/create-open-source-schematic-svg-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro4948: HSP USB LED preserves pad nets and loses trace and via nets on export", async () => {
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

  const getCopperNets = (pcb: KicadPcb) => {
    const origin = pcb.footprints.find((footprint) =>
      footprint.properties.some(
        (property) => property.key === "Reference" && property.value === "J1",
      ),
    )!.position!
    // Compare relative geometry to 0.000001 mm across board translations.
    const point = ({ x, y }: { x: number; y: number }) =>
      [x - origin.x, y - origin.y].map((value) => Number(value.toFixed(6)))
    const netName = (id: number | undefined) =>
      pcb.nets.find((net) => net.id === id)?.name || null
    const segments = pcb.segments.map((segment) => ({
      geometry: JSON.stringify([
        [point(segment.start!), point(segment.end!)].sort(),
        segment.width,
        segment.layer?.names,
      ]),
      net: netName(segment.net?.id),
    }))
    const vias = pcb.vias.map((via) => ({
      geometry: JSON.stringify([
        point(via.at!),
        via.size,
        via.drill,
        via.layers?.names,
      ]),
      net: netName(via.net?.id),
    }))
    return {
      segments: segments.sort((a, b) => a.geometry.localeCompare(b.geometry)),
      vias: vias.sort((a, b) => a.geometry.localeCompare(b.geometry)),
    }
  }
  const sourceCopper = getCopperNets(sourcePcb)
  const outputCopper = getCopperNets(outputPcb)
  expect(sourceCopper.segments).toHaveLength(41)
  expect(sourceCopper.vias).toHaveLength(6)
  for (const kind of ["segments", "vias"] as const) {
    expect(sourceCopper[kind].every(({ net }) => net !== null)).toBe(true)
    // Current bug: geometry survives, but every copper item becomes net 0.
    expect(outputCopper[kind]).toEqual(
      sourceCopper[kind].map((item) => ({ ...item, net: null })),
    )
  }

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
  const comparison = createSideBySideSvg(sourceSvg!, outputSvg!)
  const height = Number(comparison.match(/height="([\d.]+)"/u)![1])
  const rows = [
    [
      "physical pads",
      sourcePads.map(([, net]) => net),
      outputPads.map(([, net]) => net),
    ],
    [
      "trace segments",
      sourceCopper.segments.map(({ net }) => net),
      outputCopper.segments.map(({ net }) => net),
    ],
    [
      "vias",
      sourceCopper.vias.map(({ net }) => net),
      outputCopper.vias.map(({ net }) => net),
    ],
  ] as const
  const counts = rows
    .flatMap(([label, sourceNets, outputNets], row) =>
      [sourceNets, outputNets].map((nets, column) => {
        const assigned = nets.filter((net) => net !== null).length
        const color = assigned === nets.length ? "#8fd6a7" : "#ff9b9b"
        return `<text x="${18 + column * 600}" y="${52 + row * 22}" fill="${color}" font-size="16">${assigned}/${nets.length} ${label} have assigned nets</text>`
      }),
    )
    .join("\n")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height + 134}" viewBox="0 0 1200 ${height + 134}">
<rect width="100%" height="100%" fill="#101820"/>
<g font-family="sans-serif">
<text x="18" y="28" fill="white" font-size="20">HSP USB LED — original KiCad</text>
<text x="618" y="28" fill="white" font-size="20">Current KiCad round trip</text>
${counts}
<text x="18" y="118" fill="#b8c5d0" font-size="14">${sourcePcb.nets.filter((net) => net.id !== 0).length} net definitions</text>
<text x="618" y="118" fill="#b8c5d0" font-size="14">${outputPcb.nets.filter((net) => net.id !== 0).length} net definitions</text>
</g>
${comparison.replace("<svg", '<svg x="0" y="134"')}
</svg>`
  await expectOpenSourceSvgSnapshot(svg, import.meta.path)
}, 120000)

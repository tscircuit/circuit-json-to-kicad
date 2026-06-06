import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const getZoneBlocks = (kicadPcb: string) =>
  kicadPcb.match(/  \(zone[\s\S]*?\n  \)/g) ?? []

const getKeepoutZoneSnapshot = (zoneBlocks: string[]) =>
  zoneBlocks.map((zoneBlock) => {
    const pointMatches = [...zoneBlock.matchAll(/\(xy ([^)]+)\)/g)].map(
      (match) => match[1],
    )

    return {
      layer:
        zoneBlock.match(/\((layers? [^)]+)\)/)?.[1]?.replaceAll('"', "") ?? "",
      keepout: {
        tracks: zoneBlock.match(/\(tracks ([^)]+)\)/)?.[1] ?? "",
        vias: zoneBlock.match(/\(vias ([^)]+)\)/)?.[1] ?? "",
        pads: zoneBlock.match(/\(pads ([^)]+)\)/)?.[1] ?? "",
        copperpour: zoneBlock.match(/\(copperpour ([^)]+)\)/)?.[1] ?? "",
        footprints: zoneBlock.match(/\(footprints ([^)]+)\)/)?.[1] ?? "",
      },
      polygonPointCount: pointMatches.length,
      firstPolygonPoints: pointMatches.slice(0, 4),
    }
  })

test(
  "pcb keepouts export as KiCad keepout zones",
  async () => {
    const circuit = new Circuit()
    circuit.add(
      <board width="10mm" height="10mm">
        <keepout shape="rect" pcbX={12} pcbY={0} width="2.4mm" height="5mm" />
        <keepout
          shape="circle"
          pcbX={-3}
          pcbY={2}
          radius="1mm"
          layers={["top", "bottom"]}
        />
      </board>,
    )

    await circuit.renderUntilSettled()

    const circuitJson = circuit.getCircuitJson()
    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()

    const outputString = converter.getOutputString()
    const zoneBlocks = getZoneBlocks(outputString)

    expect(zoneBlocks).toHaveLength(2)

    const rectKeepout = zoneBlocks[0]!
    expect(rectKeepout).toContain("(net 0)")
    expect(rectKeepout).toContain('(net_name "")')
    expect(rectKeepout).toContain("(layer F.Cu)")
    expect(rectKeepout).toContain("(keepout")
    expect(rectKeepout).toContain("(tracks not_allowed)")
    expect(rectKeepout).toContain("(vias not_allowed)")
    expect(rectKeepout).toContain("(pads not_allowed)")
    expect(rectKeepout).toContain("(copperpour not_allowed)")
    expect(rectKeepout).toContain("(footprints not_allowed)")
    expect(rectKeepout).toContain("(xy 113.2 102.5)")
    expect(rectKeepout).toContain("(xy 110.8 97.5)")

    const circleKeepout = zoneBlocks[1]!
    expect(circleKeepout).toContain("(layers F.Cu B.Cu)")
    expect(circleKeepout).toContain("(keepout")
    expect(circleKeepout).toContain("(xy 98 98)")
    expect(circleKeepout).toContain("(xy 97 99)")

    expect(getKeepoutZoneSnapshot(zoneBlocks)).toMatchInlineSnapshot(`
      [
        {
          "firstPolygonPoints": [
            "113.2 102.5",
            "113.2 97.5",
            "110.8 97.5",
            "110.8 102.5",
          ],
          "keepout": {
            "copperpour": "not_allowed",
            "footprints": "not_allowed",
            "pads": "not_allowed",
            "tracks": "not_allowed",
            "vias": "not_allowed",
          },
          "layer": "layer F.Cu",
          "polygonPointCount": 4,
        },
        {
          "firstPolygonPoints": [
            "98 98",
            "97.99518472667219 97.90198285967044",
            "97.98078528040323 97.80490967798387",
            "97.95694033573221 97.70971532274554",
          ],
          "keepout": {
            "copperpour": "not_allowed",
            "footprints": "not_allowed",
            "pads": "not_allowed",
            "tracks": "not_allowed",
            "vias": "not_allowed",
          },
          "layer": "layers F.Cu B.Cu",
          "polygonPointCount": 64,
        },
      ]
    `)

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: outputString,
      kicadFileType: "pcb",
    })

    expect(kicadSnapshot.exitCode).toBe(0)

    expect(
      stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({
          circuitJson,
          outputType: "pcb",
        }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 120000 },
)

import { expect, test } from "bun:test"
import type { CircuitJson, PcbCopperPour } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import fixture from "../../assets/nema34-zone-clearance/circuit.json"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

// Actual NEMA34 fill fragments imported from the native PCB at pd1180-epr@952de54.
// PCB SHA256: 2880cf5c42f62f26465c4ceb164357e5228ccf19ff86d115c116c3b1ec52891e.
// The importer preserved source clearances; only net_name -> source_net_id mapping
// was added. The first GND fragment belongs to zone 8b811c38-934e-46ff-8ad4-933b2ccfbbdb.
const converter = new CircuitJsonToKicadPcbConverter(fixture as CircuitJson)
converter.runUntilFinished()
const output = converter.getOutputString()
const pcb = parseKicadPcb(output)

test("NEMA34 repro: fixture and exported net/layer identities", () => {
  const pours = fixture.filter((p) => p.type === "pcb_copper_pour")
  expect(pours.map((p) => p.clearance)).toEqual([0.16, 0.3, 0.3])
  expect(pcb.zones.map((z) => [z.netName, z.layer?.names[0]])).toEqual([
    ["EFUSE_IN", "B.Cu"],
    ["GND", "In1.Cu"],
    ["GND", "In1.Cu"],
  ])
})

test("NEMA34: preserve local clearance rather than hard-code 0.15 mm", () => {
  expect(pcb.zones.map((z) => z.connectPads?.clearance)).toEqual([
    0.16, 0.3, 0.3,
  ])
})

test("NEMA34 repro: KiCad PCB snapshot", async () => {
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    pcbLayers: ["In1.Cu", "B.Cu", "Edge.Cuts"],
    includeSvg: true,
  })
  expect(snapshot.exitCode).toBe(0)
  expect(snapshot.generatedFileContent["temp_file.png"]!).toMatchPngSnapshot(
    import.meta.path,
  )
})

function exportPcb(input: CircuitJson) {
  const converter = new CircuitJsonToKicadPcbConverter(input)
  converter.runUntilFinished()
  return parseKicadPcb(converter.getOutputString())
}

const vertices = [
  { x: -2, y: -2 },
  { x: 2, y: -2 },
  { x: 0, y: 2 },
]
const shapes = [
  { shape: "polygon", points: vertices },
  { shape: "rect", center: { x: 0, y: 0 }, width: 4, height: 4 },
  { shape: "brep", brep_shape: { outer_ring: { vertices }, inner_rings: [] } },
] as const

for (const shape of shapes) {
  test(`${shape.shape}: preserve explicit clearance including zero; default only when absent`, () => {
    const pour = {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pour",
      layer: "top",
      ...shape,
    } as PcbCopperPour
    const base = [
      fixture.find((e) => e.type === "pcb_board")!,
      pour,
    ] as CircuitJson
    const defaultZone = exportPcb(base).zones[0]!
    expect(defaultZone.connectPads?.clearance).toBe(0.15)
    for (const clearance of [0, 0.16, 0.3, 0.5]) {
      const withClearance = { ...pour, clearance }
      const zone = exportPcb([base[0]!, withClearance]).zones[0]!
      expect(zone.connectPads?.clearance).toBe(clearance)
      expect(zone.polygons.map((p) => p.getString())).toEqual(
        defaultZone.polygons.map((p) => p.getString()),
      )
      expect(zone.filledPolygons.map((p) => p.getString())).toEqual(
        defaultZone.filledPolygons.map((p) => p.getString()),
      )
    }
  })
}

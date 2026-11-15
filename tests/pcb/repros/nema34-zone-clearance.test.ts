import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
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

test.failing("NEMA34: preserve local clearance rather than hard-code 0.15 mm", () => {
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

import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createAutoroutedInnerLayerVias } from "../../fixtures/create-autorouted-inner-layer-vias"

test("deduplicates identical physical vias without merging distinct spans or nets", async () => {
  const circuitJson = await createAutoroutedInnerLayerVias()
  const via = circuitJson.find((e) => e.type === "pcb_via")!
  const duplicate = { ...via, pcb_via_id: `${via.pcb_via_id}_duplicate` }
  const distinctSpan = {
    ...via,
    pcb_via_id: `${via.pcb_via_id}_blind`,
    layers: ["top", "inner1"] as typeof via.layers,
  }
  const distinctNet = {
    ...via,
    pcb_via_id: `${via.pcb_via_id}_other_net`,
    subcircuit_connectivity_map_key: "other_net",
  }
  const distinctDrill = {
    ...via,
    pcb_via_id: `${via.pcb_via_id}_other_drill`,
    hole_diameter: via.hole_diameter * 2,
  }

  for (const [extraVia, expectedCount] of [
    [duplicate, 2],
    [distinctSpan, 3],
    [distinctNet, 3],
    [distinctDrill, 3],
  ] as const) {
    const converter = new CircuitJsonToKicadPcbConverter([
      ...circuitJson,
      extraVia,
    ])
    converter.runUntilFinished()
    expect(converter.getOutput().vias).toHaveLength(expectedCount)
  }
})

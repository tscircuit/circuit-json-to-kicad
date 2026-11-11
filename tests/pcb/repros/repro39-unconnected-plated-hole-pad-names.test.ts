import { expect, test } from "bun:test"
import { createPadNameRoundTrip } from "../../fixtures/create-pad-name-round-trip"

test.failing("plated-hole pads retain multi-letter package names with and without source ports", () => {
  for (const connected of [true, false]) {
    const { circuitJson, source, output } = createPadNameRoundTrip({
      padType: "thru_hole",
      connected,
    })
    const originalPads = source.footprints[0]!.fpPads
    const importedPads = circuitJson.filter(
      (element) => element.type === "pcb_plated_hole",
    )

    expect(importedPads.map((pad) => pad.port_hints?.[0])).toEqual(
      originalPads.map((pad) => pad.number),
    )
    expect(
      circuitJson.filter((element) => element.type === "source_port"),
    ).toHaveLength(connected ? originalPads.length : 0)
    expect(
      output.footprints[0]!.fpPads.map((pad) => [pad.number, pad.net?.name]),
    ).toEqual(originalPads.map((pad) => [pad.number, pad.net?.name]))
  }
})

import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { AddFootprintsStage } from "lib/pcb/stages/AddFootprintsStage"
import { createInternalGroundPadRepro } from "../../fixtures/internal-ground-pad-repro"

test("internally connected exposed-pad sections inherit GND without mutating input", async () => {
  const circuitJson = await createInternalGroundPadRepro()
  const sourcePorts = circuitJson.filter(
    (element) => element.type === "source_port",
  )
  expect(sourcePorts).toHaveLength(9)
  expect(
    sourcePorts.filter((port) => port.subcircuit_connectivity_map_key),
  ).toHaveLength(1)
  // Imported boards may declare internal connections in either supported format.
  for (const format of ["both", "component", "connection", "neither"]) {
    const input = circuitJson
      .filter((element) =>
        format === "component" || format === "neither"
          ? element.type !== "source_component_internal_connection"
          : true,
      )
      .map((element) => {
        if (
          element.type !== "source_component" ||
          (format !== "connection" && format !== "neither")
        )
          return element
        const { internally_connected_source_port_ids, ...component } = element
        return component
      })
    const original = JSON.stringify(input)
    const converter = new CircuitJsonToKicadPcbConverter(input)
    // Net resolution must finish before footprint conversion begins.
    while (!(converter.currentStage instanceof AddFootprintsStage)) {
      converter.step()
    }
    expect(
      input
        .filter((element) => element.type === "pcb_port")
        .filter(
          (port) =>
            converter.ctx.pcbNetMap?.get(port.pcb_port_id)?.name === "GND",
        ),
    ).toHaveLength(format === "neither" ? 1 : 9)
    converter.runUntilFinished()
    const pcb = parseKicadPcb(converter.getOutputString())
    const footprint = pcb.footprints[0]!
    expect(footprint.fpPads).toHaveLength(9)
    if (format === "neither") {
      expect(
        footprint.fpPads.filter((pad) => pad.net?.name === "GND"),
      ).toHaveLength(1)
      expect(footprint.duplicatePadNumbersAreJumpers).toBeUndefined()
      continue
    }
    expect(
      footprint.fpPads.every(
        (pad) => pad.number === "39" && pad.net?.name === "GND",
      ),
    ).toBe(true)
    expect(new Set(footprint.fpPads.map((pad) => pad.net?.id)).size).toBe(1)
    expect(footprint.duplicatePadNumbersAreJumpers).toBe("yes")
    expect(JSON.stringify(input)).toBe(original)
  }
})

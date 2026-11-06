import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "../lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadSchConverter } from "../lib/schematic/CircuitJsonToKicadSchConverter"
import fixture from "./fixtures/physical-bga-balls.circuit.json"

test("numeric source pins retain numeric export even with physical ball aliases", () => {
  const circuitJson = structuredClone(fixture) as CircuitJson
  for (const element of circuitJson) {
    if (element.type === "source_port") {
      const ordinal = circuitJson.find(
        (candidate) =>
          candidate.type === "schematic_port" &&
          candidate.source_port_id === element.source_port_id,
      )
      if (ordinal?.type !== "schematic_port")
        throw new Error("Missing schematic port")
      element.pin_number = ordinal.pin_number
      element.name = `IN${element.pin_number}`
    }
  }
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()
  const sch = new CircuitJsonToKicadSchConverter(circuitJson)
  sch.runUntilFinished()
  for (const number of [1, 2, 3]) {
    expect(pcb.getOutputString()).toContain(`(pad "${number}"`)
    expect(sch.getOutputString()).toContain(`(number "${number}"`)
    expect(sch.getOutputString()).toContain(`(pin "${number}"`)
  }
})

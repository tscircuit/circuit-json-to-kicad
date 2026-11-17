import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
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

for (const shape of ["smd", "thru_hole"] as const) {
  test(`numeric ${shape} pads keep their number when the signal name is also a hint`, () => {
    const circuitJson = structuredClone(fixture) as CircuitJson
    for (const element of circuitJson) {
      if (element.type !== "source_port") continue
      const pin = Number(element.source_port_id.split("_").at(-1)) + 1
      element.pin_number = pin
      element.name = `IN${pin}`
    }
    const input = circuitJson.map((element) => {
      if (element.type !== "pcb_smtpad") return element
      const pin = Number(element.pcb_port_id?.split("_").at(-1)) + 1
      const port_hints = [String(pin), `pin${pin}`, `IN${pin}`]
      if (shape === "smd") return { ...element, port_hints }
      return {
        type: "pcb_plated_hole",
        pcb_plated_hole_id: element.pcb_smtpad_id,
        pcb_component_id: element.pcb_component_id,
        pcb_port_id: element.pcb_port_id,
        shape: "circle",
        x: element.x,
        y: element.y,
        outer_diameter: 0.4,
        hole_diameter: 0.2,
        layers: ["top", "bottom"],
        port_hints,
      } as const
    }) as CircuitJson
    const pcb = new CircuitJsonToKicadPcbConverter(input)
    pcb.runUntilFinished()
    const numbers = parseKicadPcb(pcb.getOutputString())
      .footprints[0]!.fpPads.filter((pad) => pad.net)
      .map((pad) => pad.number)
    expect(numbers).toEqual(["1", "2", "3"])
  })
}

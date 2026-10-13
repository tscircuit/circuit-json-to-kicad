import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "../lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadSchConverter } from "../lib/schematic/CircuitJsonToKicadSchConverter"
import fixture from "./fixtures/physical-bga-balls.circuit.json"

test("physical ball names agree in PCB pads, library pins, and symbol instances", () => {
  // Fresh three-ball circuit emitted by the physical-pin regression in core.
  // Numeric pin_number values are layout ordinals, not package pad numbers.
  const circuitJson = fixture as CircuitJson
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()
  const pcbText = pcb.getOutputString()
  const sch = new CircuitJsonToKicadSchConverter(circuitJson)
  sch.runUntilFinished()
  const schText = sch.getOutputString()
  for (const ball of ["A1", "A2", "B1"]) {
    expect(pcbText).toContain(`(pad "${ball}"`)
    expect(schText).toContain(`(number "${ball}"`)
    expect(schText).toContain(`(pin "${ball}"`)
  }
  expect(pcbText).not.toContain('(pad "1"')
})

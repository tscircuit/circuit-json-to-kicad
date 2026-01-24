import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("rats nest should be preserved from source traces even without connectivity map keys", async () => {
  const circuitJson: any = [
    {
      type: "source_component",
      source_component_id: "c1",
      name: "R1",
    },
    {
      type: "source_port",
      source_port_id: "p1",
      name: "1",
      source_component_id: "c1",
    },
    {
      type: "source_port",
      source_port_id: "p2",
      name: "2",
      source_component_id: "c1",
    },
    {
      type: "source_component",
      source_component_id: "c2",
      name: "R2",
    },
    {
      type: "source_port",
      source_port_id: "p3",
      name: "1",
      source_component_id: "c2",
    },
    {
      type: "source_port",
      source_port_id: "p4",
      name: "2",
      source_component_id: "c2",
    },
    {
      type: "source_trace",
      source_trace_id: "t1",
      connected_source_port_ids: ["p1", "p3"],
      // NO subcircuit_connectivity_map_key here!
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_c1",
      source_component_id: "c1",
      center: { x: 0, y: 0 },
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_p1",
      source_port_id: "p1",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "smt1",
      pcb_component_id: "pcb_c1",
      pcb_port_id: "pcb_p1",
      shape: "rect",
      x: -1,
      y: 0,
      width: 0.5,
      height: 0.5,
      layer: "top",
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_c2",
      source_component_id: "c2",
      center: { x: 10, y: 0 },
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_p3",
      source_port_id: "p3",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "smt3",
      pcb_component_id: "pcb_c2",
      pcb_port_id: "pcb_p3",
      shape: "rect",
      x: 9,
      y: 0,
      width: 0.5,
      height: 0.5,
      layer: "top",
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const pcb = converter.getOutput()

  // Find pads
  const pad1 = pcb.footprints[0]?.fpPads[0]
  const pad3 = pcb.footprints[1]?.fpPads[0]

  expect(pad1).toBeDefined()
  expect(pad3).toBeDefined()

  // They should both have the same non-zero net
  expect(pad1!.net).toBeDefined()
  expect(pad3!.net).toBeDefined()
  expect(pad1!.net!.id).toBeGreaterThan(0)
  expect(pad1!.net!.id).toBe(pad3!.net!.id)
})

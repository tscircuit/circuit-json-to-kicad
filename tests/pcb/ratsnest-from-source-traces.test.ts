import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import type { CircuitJson } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

async function expectSvgSnapshot(
  svg: string,
  testPathOriginal: string,
): Promise<void> {
  const testPath = testPathOriginal.replace(/\.test\.tsx?$/u, "")
  const snapshotPath = join(
    dirname(testPath),
    "__snapshots__",
    `${basename(testPath)}.snap.svg`,
  )
  const updateSnapshot =
    process.argv.includes("--update-snapshots") ||
    process.argv.includes("-u") ||
    Boolean(process.env.BUN_UPDATE_SNAPSHOTS)

  if (!existsSync(snapshotPath) || updateSnapshot) {
    await mkdir(dirname(snapshotPath), { recursive: true })
    await writeFile(snapshotPath, svg)
    expect(existsSync(snapshotPath)).toBe(true)
    return
  }

  const existingSnapshot = await readFile(snapshotPath, "utf8")
  expect(svg).toBe(existingSnapshot)
}

test("preserves ratsnest nets from source traces without connectivity keys", async () => {
  const circuitJson: CircuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_1",
      center: { x: 0, y: 0 },
      width: 14,
      height: 8,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    },
    {
      type: "source_component",
      source_component_id: "c1",
      name: "R1",
      ftype: "simple_resistor",
      resistance: 1000,
    },
    {
      type: "source_port",
      source_port_id: "p1",
      name: "1",
      pin_number: 1,
      source_component_id: "c1",
    },
    {
      type: "source_port",
      source_port_id: "p2",
      name: "2",
      pin_number: 2,
      source_component_id: "c1",
    },
    {
      type: "source_component",
      source_component_id: "c2",
      name: "R2",
      ftype: "simple_resistor",
      resistance: 1000,
    },
    {
      type: "source_port",
      source_port_id: "p3",
      name: "1",
      pin_number: 1,
      source_component_id: "c2",
    },
    {
      type: "source_port",
      source_port_id: "p4",
      name: "2",
      pin_number: 2,
      source_component_id: "c2",
    },
    {
      type: "source_component",
      source_component_id: "c3",
      name: "R3",
      ftype: "simple_resistor",
      resistance: 1000,
    },
    {
      type: "source_port",
      source_port_id: "p5",
      name: "1",
      pin_number: 1,
      source_component_id: "c3",
    },
    {
      type: "source_port",
      source_port_id: "p6",
      name: "2",
      pin_number: 2,
      source_component_id: "c3",
    },
    {
      type: "source_trace",
      source_trace_id: "source_trace_ab",
      connected_source_port_ids: ["p1", "p3"],
      connected_source_net_ids: [],
    },
    {
      type: "source_trace",
      source_trace_id: "source_trace_bc",
      connected_source_port_ids: ["p3", "p5"],
      connected_source_net_ids: [],
    },
    {
      type: "source_trace",
      source_trace_id: "source_trace_gnd",
      display_name: "GND_BUS",
      connected_source_port_ids: ["p2", "p4", "p6"],
      connected_source_net_ids: [],
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_c1",
      source_component_id: "c1",
      center: { x: -4, y: 0 },
      width: 2,
      height: 1,
      layer: "top",
      rotation: 0,
      obstructs_within_bounds: false,
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_p1",
      pcb_component_id: "pcb_c1",
      source_port_id: "p1",
      x: -4.6,
      y: 0,
      layers: ["top"],
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_p2",
      pcb_component_id: "pcb_c1",
      source_port_id: "p2",
      x: -3.4,
      y: 0,
      layers: ["top"],
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "smt1",
      pcb_component_id: "pcb_c1",
      pcb_port_id: "pcb_p1",
      shape: "rect",
      x: -4.6,
      y: 0,
      width: 0.8,
      height: 0.9,
      layer: "top",
      port_hints: ["1"],
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "smt2",
      pcb_component_id: "pcb_c1",
      pcb_port_id: "pcb_p2",
      shape: "rect",
      x: -3.4,
      y: 0,
      width: 0.8,
      height: 0.9,
      layer: "top",
      port_hints: ["2"],
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_c2",
      source_component_id: "c2",
      center: { x: 0, y: 0 },
      width: 2,
      height: 1,
      layer: "top",
      rotation: 0,
      obstructs_within_bounds: false,
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_p3",
      pcb_component_id: "pcb_c2",
      source_port_id: "p3",
      x: -0.6,
      y: 0,
      layers: ["top"],
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_p4",
      pcb_component_id: "pcb_c2",
      source_port_id: "p4",
      x: 0.6,
      y: 0,
      layers: ["top"],
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "smt3",
      pcb_component_id: "pcb_c2",
      pcb_port_id: "pcb_p3",
      shape: "rect",
      x: -0.6,
      y: 0,
      width: 0.8,
      height: 0.9,
      layer: "top",
      port_hints: ["1"],
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "smt4",
      pcb_component_id: "pcb_c2",
      pcb_port_id: "pcb_p4",
      shape: "rect",
      x: 0.6,
      y: 0,
      width: 0.8,
      height: 0.9,
      layer: "top",
      port_hints: ["2"],
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_c3",
      source_component_id: "c3",
      center: { x: 4, y: 0 },
      width: 2,
      height: 1,
      layer: "top",
      rotation: 0,
      obstructs_within_bounds: false,
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_p5",
      pcb_component_id: "pcb_c3",
      source_port_id: "p5",
      x: 3.4,
      y: 0,
      layers: ["top"],
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_p6",
      pcb_component_id: "pcb_c3",
      source_port_id: "p6",
      x: 4.6,
      y: 0,
      layers: ["top"],
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "smt5",
      pcb_component_id: "pcb_c3",
      pcb_port_id: "pcb_p5",
      shape: "rect",
      x: 3.4,
      y: 0,
      width: 0.8,
      height: 0.9,
      layer: "top",
      port_hints: ["1"],
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "smt6",
      pcb_component_id: "pcb_c3",
      pcb_port_id: "pcb_p6",
      shape: "rect",
      x: 4.6,
      y: 0,
      width: 0.8,
      height: 0.9,
      layer: "top",
      port_hints: ["2"],
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const kicadPcb = converter.getOutput()
  const nonZeroNets = kicadPcb.nets.filter((net) => net.id !== 0)
  expect(nonZeroNets).toHaveLength(2)

  const [r1, r2, r3] = kicadPcb.footprints
  const r1Pad1 = r1?.fpPads.find((pad) => pad.number === "1")
  const r1Pad2 = r1?.fpPads.find((pad) => pad.number === "2")
  const r2Pad1 = r2?.fpPads.find((pad) => pad.number === "1")
  const r2Pad2 = r2?.fpPads.find((pad) => pad.number === "2")
  const r3Pad1 = r3?.fpPads.find((pad) => pad.number === "1")
  const r3Pad2 = r3?.fpPads.find((pad) => pad.number === "2")

  expect(r1Pad1?.net?.id).toBeGreaterThan(0)
  expect(r1Pad1?.net?.id).toBe(r2Pad1?.net?.id)
  expect(r2Pad1?.net?.id).toBe(r3Pad1?.net?.id)

  expect(r1Pad2?.net?.id).toBeGreaterThan(0)
  expect(r1Pad2?.net?.id).toBe(r2Pad2?.net?.id)
  expect(r2Pad2?.net?.id).toBe(r3Pad2?.net?.id)
  expect(r1Pad2?.net?.name).toBe("GND_BUS")
  expect(r1Pad1?.net?.id).not.toBe(r1Pad2?.net?.id)

  const pcbSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    shouldDrawRatsNest: true,
  })
  expect(pcbSvg).toContain("pcb_rats_nest")
  await expectSvgSnapshot(pcbSvg, import.meta.path)
})

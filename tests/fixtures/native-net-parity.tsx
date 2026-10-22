import { expect } from "bun:test"
import { $ } from "bun"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CircuitJson } from "circuit-json"
import type { ReactElement } from "react"
import { Circuit } from "tscircuit"
import { parseKicadPcb, parseKicadSch, type KicadPcb } from "kicadts"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { exportNativeSchematicNets } from "./export-native-schematic-nets"

export async function render(element: ReactElement) {
  const circuit = new Circuit()
  circuit.add(element)
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}

export async function exportNativeSchematicParity(circuitJson: CircuitJson) {
  const schematic = new CircuitJsonToKicadSchConverter(circuitJson)
  schematic.runUntilFinished()
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()
  const directory = await mkdtemp(join(tmpdir(), "net-parity-"))
  try {
    for (const file of schematic.getOutputFiles({
      schematicFilename: "root.kicad_sch",
    })) {
      await writeFile(join(directory, file.filename), file.content)
    }
    const pcbPath = join(directory, "root.kicad_pcb")
    const reportPath = join(directory, "drc.json")
    await writeFile(pcbPath, pcb.getOutputString())
    await $`kicad-cli pcb drc --schematic-parity --format json -o ${reportPath} ${pcbPath}`.quiet()
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      schematic_parity: { type: string; description: string }[]
    }
    return report.schematic_parity
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function expectNativeParity(circuitJson: CircuitJson) {
  const input = JSON.stringify(circuitJson)
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()
  expect(JSON.stringify(circuitJson)).toBe(input)
  const native = await exportNativeSchematicNets(circuitJson)
  const output = parseKicadPcb(pcb.getOutputString())
  const names = new Map(output.nets.map((net) => [net.id, net.name]))
  const pinsByNet = new Map<number, Set<string>>()
  for (const footprint of output.footprints) {
    const reference = footprint.properties.find(
      (p) => p.key === "Reference",
    )!.value
    for (const pad of footprint.fpPads) {
      expect(pad.net?.id).toBeGreaterThan(0)
      expect(pad.net!.name).toBe(names.get(pad.net!.id!))
      const pins = pinsByNet.get(pad.net!.id!) ?? new Set<string>()
      pins.add(`${reference}.${pad.number}`)
      pinsByNet.set(pad.net!.id!, pins)
    }
  }
  const actual = [...pinsByNet].map(([id, pins]) => ({
    name: names.get(id),
    pins: [...pins].sort(),
  }))
  const byName = (
    a: { name: string | undefined },
    b: { name: string | undefined },
  ) => (a.name! < b.name! ? -1 : a.name! > b.name! ? 1 : 0)
  expect(actual.sort(byName)).toEqual(native.sort(byName))

  // Existing labels are allowed. Naming the PCB must never introduce new ones.
  const sch = new CircuitJsonToKicadSchConverter(circuitJson)
  sch.runUntilFinished()
  const sheets = sch
    .getOutputFiles({ schematicFilename: "root.kicad_sch" })
    .map((file) => parseKicadSch(file.content))
  expect(sheets.reduce((sum, sheet) => sum + sheet.labels.length, 0)).toBe(
    circuitJson.filter((e) => e.type === "schematic_text" && e.source_trace_id)
      .length,
  )
  expect(
    sheets.reduce((sum, sheet) => sum + sheet.globalLabels.length, 0),
  ).toBe(
    circuitJson.filter(
      (e) => e.type === "schematic_net_label" && !e.symbol_name,
    ).length,
  )
  return { pcb, native }
}

export function getPadNet(pcb: KicadPcb, reference: string, number: string) {
  return pcb.footprints
    .find((footprint) =>
      footprint.properties.some(
        (property) =>
          property.key === "Reference" && property.value === reference,
      ),
    )!
    .fpPads.find((pad) => pad.number === number)!.net!
}

export async function renderIndependentConnections() {
  return render(
    <board width="30mm" height="20mm" routingDisabled schMaxTraceDistance={100}>
      <resistor
        name="R1"
        resistance="1k"
        footprint="0603"
        schX={-3}
        schY={-3}
        pcbX={-3}
        pcbY={-3}
      />
      <capacitor
        name="C1"
        capacitance="1uF"
        footprint="0603"
        schX={3}
        schY={-3}
        pcbX={3}
        pcbY={-3}
      />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0603"
        schX={-3}
        schY={3}
        pcbX={-3}
        pcbY={3}
      />
      <capacitor
        name="C2"
        capacitance="1uF"
        footprint="0603"
        schX={3}
        schY={3}
        pcbX={3}
        pcbY={3}
      />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      <trace from=".R2 > .pin2" to=".C2 > .pin1" />
    </board>,
  )
}

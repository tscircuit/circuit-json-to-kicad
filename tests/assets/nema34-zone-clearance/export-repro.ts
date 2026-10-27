import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"
import fixture from "./circuit.json"

const output = resolve(process.argv[2] ?? "debug-output/nema34-zone-clearance")
await mkdir(output, { recursive: true })
const converter = new CircuitJsonToKicadPcbConverter(fixture as CircuitJson)
converter.runUntilFinished()
await Bun.write(
  `${output}/nema34-clearance.kicad_pcb`,
  converter.getOutputString(),
)
console.log(`${output}/nema34-clearance.kicad_pcb`)

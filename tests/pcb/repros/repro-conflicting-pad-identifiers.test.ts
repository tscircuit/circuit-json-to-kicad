import { beforeAll, expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import sharp from "sharp"
import { CircuitJsonToKicadSchConverter } from "../../../lib/schematic/CircuitJsonToKicadSchConverter"
import fixture from "../../fixtures/physical-bga-balls.circuit.json"

let error: string | undefined

beforeAll(() => {
  const input = structuredClone(fixture) as CircuitJson
  for (const port of input) {
    if (port.type === "source_port") port.pin_number = 1
  }
  const pad = input.find((element) => element.type === "pcb_smtpad")
  if (!pad || pad.type !== "pcb_smtpad") throw new Error("Missing BGA pad")
  const explicitPads = [
    { ...pad, pad_number: "A1" },
    { ...pad, pcb_smtpad_id: "conflicting_pad", pad_number: "A3" },
  ]
  input.push(...explicitPads)
  try {
    const exporter = new CircuitJsonToKicadSchConverter(input)
    exporter.runUntilFinished()
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause
    error = cause.message
  }
})

test.failing("reports distinct physical IDs linked to the same source pin", () => {
  expect(error).toContain("source_port_0")
  expect(error).toContain("A1")
  expect(error).toContain("A3")
})

test("snapshots the actual result of exporting conflicting pad IDs", async () => {
  const status = error
    ? "Export rejected"
    : "Export succeeded with mismatched pin IDs"
  const detail =
    error ?? "PCB pads A1 / A3 share source_port_0; schematic pin is 1"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="125">
    <rect width="900" height="125" fill="#192630"/>
    <g font-family="sans-serif" fill="white">
      <text x="20" y="32" font-size="21">A1 and A3 linked to one source pin</text>
      <text x="20" y="66" font-size="19" fill="${error ? "#74d6ae" : "#ff8d92"}">${status}</text>
      <text x="20" y="99" font-size="15">${detail.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</text>
    </g>
  </svg>`
  await expect(sharp(Buffer.from(svg)).png().toBuffer()).toMatchPngSnapshot(
    import.meta.path,
  )
})

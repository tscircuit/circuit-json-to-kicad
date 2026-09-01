import { expect, test } from "bun:test"
import {
  createOpenSourceSchematicSvgSnapshot,
  expectOpenSourceSchematicSvgSnapshot,
} from "../../fixtures/create-open-source-schematic-svg-snapshot"

test("compares the open-source Precursor LoRa KiCad schematic round trip", async () => {
  const svg = await createOpenSourceSchematicSvgSnapshot(
    "precursor-lora.kicad_sch",
  )
  expect(svg).toContain("<svg")
  await expectOpenSourceSchematicSvgSnapshot(svg, import.meta.path)
})

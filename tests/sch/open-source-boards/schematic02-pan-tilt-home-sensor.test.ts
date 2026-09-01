import { expect, test } from "bun:test"
import {
  createOpenSourceSchematicSvgSnapshot,
  expectOpenSourceSchematicSvgSnapshot,
} from "../../fixtures/create-open-source-schematic-svg-snapshot"

test("renders the open-source pan-tilt sensor KiCad schematic", async () => {
  const svg = await createOpenSourceSchematicSvgSnapshot(
    "pan-tilt-home-sensor.kicad_sch",
  )
  expect(svg).toContain("<svg")
  await expectOpenSourceSchematicSvgSnapshot(svg, import.meta.path)
})

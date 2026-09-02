import { expect, test } from "bun:test"
import {
  createOpenSourceSchematicSvgSnapshot,
  expectOpenSourceSchematicSvgSnapshot,
} from "../../fixtures/create-open-source-schematic-svg-snapshot"

test("renders the open-source Pi Switcher Plus KiCad schematic", async () => {
  const svg = await createOpenSourceSchematicSvgSnapshot(
    "pi-switcher-plus.kicad_sch",
  )
  expect(svg).toContain("<svg")
  await expectOpenSourceSchematicSvgSnapshot(svg, import.meta.path)
}, 20_000)

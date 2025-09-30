import { test, expect } from "bun:test"
import { join } from "node:path"
import { takeKicadSnapshot } from "./take-kicad-snapshot"

test("takeKicadSnapshot", async () => {
  const snapshot = await takeKicadSnapshot({
    kicadFilePath: join(
      import.meta.dir,
      "../../kicad-demos/demos/flat_hierarchy/flat_hierarchy.kicad_sch",
    ),
    kicadFileType: "sch",
  })
  expect(snapshot).toBeDefined()
})

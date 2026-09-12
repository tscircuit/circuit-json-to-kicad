import { expect, test } from "bun:test"
import { $ } from "bun"
import type { CircuitJson } from "circuit-json"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
} from "lib"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

function createCircuitJson(minBoardEdgeClearance?: number): CircuitJson {
  return [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      width: 10,
      height: 10,
      center: { x: 0, y: 0 },
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
      min_trace_width: 0.25,
      min_board_edge_clearance: minBoardEdgeClearance,
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_0",
      // Copper is 0.4 mm from the edge: 5 - 4.5 - 0.2 / 2.
      // The 0.2 mm width deliberately violates the separate 0.25 mm rule.
      route: [
        { route_type: "wire", x: -1, y: 4.5, width: 0.2, layer: "top" },
        { route_type: "wire", x: 1, y: 4.5, width: 0.2, layer: "top" },
      ],
    },
  ]
}

test.each([0, 0.3])(
  "exports an explicit board-edge clearance of %s mm",
  (minBoardEdgeClearance) => {
    const converter = new CircuitJsonToKicadProConverter(
      createCircuitJson(minBoardEdgeClearance),
    )
    const project = JSON.parse(converter.getOutputString())
    expect(project.board.design_settings.rules).toMatchObject({
      min_copper_edge_clearance: minBoardEdgeClearance,
      min_track_width: 0.25,
    })
  },
)

test("omits the board-edge rule when the source does not declare it", () => {
  for (const circuitJson of [createCircuitJson(), []]) {
    const converter = new CircuitJsonToKicadProConverter(circuitJson)
    const project = JSON.parse(converter.getOutputString())
    expect(project.board.design_settings.rules).not.toHaveProperty(
      "min_copper_edge_clearance",
    )
  }
})

test("native KiCad DRC uses the exported edge and track-width limits", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kicad-board-rules-"))
  try {
    for (const minBoardEdgeClearance of [0.3, 0.5]) {
      const circuitJson = createCircuitJson(minBoardEdgeClearance)
      const projectName = `edge-${minBoardEdgeClearance}`
      const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
      pcbConverter.runUntilFinished()
      const proConverter = new CircuitJsonToKicadProConverter(circuitJson, {
        projectName,
      })
      const pcbPath = join(dir, `${projectName}.kicad_pcb`)
      const reportPath = join(dir, `${projectName}.json`)
      await writeFile(pcbPath, pcbConverter.getOutputString())
      await writeFile(
        join(dir, `${projectName}.kicad_pro`),
        proConverter.getOutputString(),
      )
      await $`kicad-cli pcb drc ${pcbPath} --format json -o ${reportPath}`.quiet()
      const report: { violations: { type: string }[] } = JSON.parse(
        await readFile(reportPath, "utf8"),
      )
      const violationTypes = report.violations.map(
        (violation) => violation.type,
      )
      expect(violationTypes).toContain("track_width")
      if (minBoardEdgeClearance === 0.3) {
        expect(violationTypes).not.toContain("copper_edge_clearance")
      } else {
        expect(violationTypes).toContain("copper_edge_clearance")
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)

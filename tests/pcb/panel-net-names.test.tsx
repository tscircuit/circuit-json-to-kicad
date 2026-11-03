import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { $ } from "bun"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
} from "lib"
import { parseKicadPcb } from "kicadts"
import { Circuit } from "tscircuit"

const PowerCircuit = ({ traceWidth }: { traceWidth: number }) => (
  <>
    <net name="VCC" nominalTraceWidth={traceWidth} />
    <net name="VCC_2" />
    <resistor
      name="R1"
      resistance="1k"
      footprint="0402"
      pcbX={-2}
      connections={{ pin2: "net.VCC" }}
    />
    <capacitor
      name="C1"
      capacitance="100nF"
      footprint="0402"
      pcbX={2}
      connections={{ pin1: "net.VCC" }}
    />
  </>
)

test("panel net names preserve board ownership and project rules", async () => {
  for (const { boardCount, nested } of [
    { boardCount: 1, nested: false },
    { boardCount: 1, nested: true },
    { boardCount: 2, nested: false },
    { boardCount: 2, nested: true },
  ]) {
    const circuit = new Circuit()
    const boards = Array.from({ length: boardCount }, (_, i) => (
      <board key={i} name={`Board_${i}`} width="14mm" height="18mm">
        {nested ? (
          <group name={`OUTER_${i}`} subcircuit>
            <group name={`POWER_${i}`} subcircuit>
              <PowerCircuit traceWidth={i === 0 ? 0.2 : 0.5} />
            </group>
          </group>
        ) : (
          <PowerCircuit traceWidth={i === 0 ? 0.2 : 0.5} />
        )}
      </board>
    ))
    circuit.add(
      boardCount === 1 ? (
        boards[0]!
      ) : (
        <panel layoutMode="grid" row={1} col={2} boardGap="2mm">
          {boards}
        </panel>
      ),
    )
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    const pcbBoards = circuitJson.filter((e) => e.type === "pcb_board")
    expect(pcbBoards).toHaveLength(boardCount)

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
    const pcb = parseKicadPcb(converter.getOutputString())
    const exportedNetNames = pcb.nets
      .filter((net) => net.id !== 0)
      .map((net) => net.name)
    const expectedNetNames = pcbBoards.flatMap((board) =>
      ["VCC", "VCC_2"].map((name) =>
        boardCount > 1 ? `${board.pcb_board_id}/${name}` : name,
      ),
    )
    expect(exportedNetNames.sort()).toEqual(expectedNetNames.sort())

    const project = new CircuitJsonToKicadProConverter(circuitJson).getOutput()
    expect(project.net_settings.netclass_patterns).toEqual(
      pcbBoards.map((board, i) => ({
        pattern: boardCount > 1 ? `${board.pcb_board_id}/VCC` : "VCC",
        netclass: `Trace Width ${i === 0 ? 0.2 : 0.5} mm`,
      })),
    )

    for (const board of pcbBoards) {
      const name = boardCount > 1 ? `${board.pcb_board_id}/VCC` : "VCC"
      const net = pcb.nets.find((net) => net.name === name)!
      const pads = pcb.footprints.flatMap((footprint) => footprint.fpPads)
      expect(pads.filter((pad) => pad.net?.id === net.id)).toHaveLength(2)
      expect(
        pcb.segments.filter((segment) => segment.net?.id === net.id).length,
      ).toBeGreaterThan(0)
    }

    const tempDir = await mkdtemp(join(tmpdir(), "kicad-pcb-drc-"))
    try {
      const pcbPath = join(tempDir, "panel.kicad_pcb")
      const reportPath = join(tempDir, "drc.json")
      await writeFile(pcbPath, converter.getOutputString())
      await $`kicad-cli pcb drc ${pcbPath} --format json -o ${reportPath}`.quiet()
      const drc = JSON.parse(await readFile(reportPath, "utf8"))
      expect(drc.unconnected_items).toHaveLength(0)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}, 120000)

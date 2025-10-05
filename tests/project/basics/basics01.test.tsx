import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadProConverter } from "lib"

const PROJECT_NAME = "test_project"

const SCHEMATIC_FILENAME = `${PROJECT_NAME}.kicad_sch`
const PCB_FILENAME = `${PROJECT_NAME}.kicad_pcb`

test("generates a minimal KiCad project file", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board>
      <resistor name="R1" resistance="1k" footprint="0402" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: PROJECT_NAME,
    schematicFilename: SCHEMATIC_FILENAME,
    pcbFilename: PCB_FILENAME,
  })

  converter.runUntilFinished()

  const output = converter.getOutputString()
  const project = JSON.parse(output)

  expect(project.version).toBe(1)
  expect(project.head.project_name).toBe(PROJECT_NAME)
  expect(project.schematic.last_opened_files).toContain(SCHEMATIC_FILENAME)
  expect(project.board.last_opened_board).toBe(PCB_FILENAME)
  expect(Array.isArray(project.sheets)).toBe(true)
  expect(project.sheets[0][1]).toBe("Root")
})

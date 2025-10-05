import { test } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadProConverter,
  CircuitJsonToKicadSchConverter,
  CircuitJsonToKicadPcbConverter,
} from "lib"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"

const PROJECT_NAME = "full_test_project"
const OUTPUT_DIR = join(__dirname, "../../debug-output", PROJECT_NAME)

test("exports full KiCad project with .kicad_pro, .kicad_sch, and .kicad_pcb files", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-3} pcbY={0} />
      <resistor name="R2" resistance="10k" footprint="0603" pcbX={3} pcbY={0} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0805"
        pcbX={0}
        pcbY={3}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()

  // Create output directory
  mkdirSync(OUTPUT_DIR, { recursive: true })

  // Generate .kicad_pro file
  const proConverter = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: PROJECT_NAME,
    schematicFilename: `${PROJECT_NAME}.kicad_sch`,
    pcbFilename: `${PROJECT_NAME}.kicad_pcb`,
  })
  proConverter.runUntilFinished()
  const proContent = proConverter.getOutputString()
  writeFileSync(join(OUTPUT_DIR, `${PROJECT_NAME}.kicad_pro`), proContent)

  // Generate .kicad_sch file
  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  schConverter.runUntilFinished()
  const schContent = schConverter.getOutputString()
  writeFileSync(join(OUTPUT_DIR, `${PROJECT_NAME}.kicad_sch`), schContent)

  // Generate .kicad_pcb file
  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const pcbContent = pcbConverter.getOutputString()
  writeFileSync(join(OUTPUT_DIR, `${PROJECT_NAME}.kicad_pcb`), pcbContent)

  Bun.write("./debug-output/kicad.kicad_pro", proContent)
  Bun.write("./debug-output/kicad.kicad_sch", schContent)
  Bun.write("./debug-output/kicad.kicad_pcb", pcbContent)

})

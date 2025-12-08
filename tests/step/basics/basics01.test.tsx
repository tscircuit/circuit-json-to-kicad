import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadStepConverter } from "lib"

test("step basics01 - generates STEP file from circuit", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="15mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={0} pcbY={0} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        pcbX={5}
        pcbY={0}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadStepConverter(circuitJson, {
    productName: "TestPCB",
    includeComponents: true,
  })

  await converter.convert()

  const stepContent = converter.getOutputString()

  // Verify STEP format
  expect(stepContent).toContain("ISO-10303-21")
  expect(stepContent).toContain("END-ISO-10303-21")

  // Verify product structure
  expect(stepContent).toContain("TestPCB")
  expect(stepContent).toContain("MANIFOLD_SOLID_BREP")

  // Write debug output
  Bun.write("./debug-output/step-basics01.step", stepContent)

  console.log("✓ STEP file generated successfully")
  console.log(`  - STEP text length: ${stepContent.length} bytes`)
})

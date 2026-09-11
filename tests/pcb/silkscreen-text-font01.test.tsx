import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { identity } from "transformation-matrix"
import { createGrTextFromCircuitJson } from "lib/pcb/stages/utils/CreateGrTextFromCircuitJson"
import { createFpTextFromCircuitJson } from "lib/pcb/stages/utils/CreateFpTextFromCircuitJson"
import { createSilkscreenTextFont } from "lib/pcb/stages/utils/createSilkscreenTextFont"

test("silkscreen text fits source width without lowering native text height", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={10.4} height={10.4}>
      <silkscreentext text="SN74LVC1G17DCKR" pcbX={0} pcbY={0} fontSize={0.8} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const textElement = circuit
    .getCircuitJson()
    .find((e) => e.type === "pcb_silkscreen_text")!
  if (textElement.type !== "pcb_silkscreen_text")
    throw new Error("Missing text")
  const graphics = createGrTextFromCircuitJson({
    textElement,
    c2kMatPcb: identity(),
  })!
  const footprint = createFpTextFromCircuitJson({
    textElement,
    componentCenter: { x: 0, y: 0 },
  })!
  for (const output of [graphics.getString(), footprint.getString()]) {
    expect(output).toContain("SN74LVC1G17DCKR")
    expect(output).toContain("(thickness 0.1)")
    expect(output).not.toContain("(size 0.8 0.8)")
  }
  const font = createSilkscreenTextFont(textElement.text, 0.8)
  expect(font.size.height).toBe(0.8)
  expect(font.size.width).toBeGreaterThan(0)
  expect(font.size.width).toBeLessThan(0.8)
  expect(createSilkscreenTextFont("WWW", 0.8).size.width).toBeLessThan(
    createSilkscreenTextFont("III", 0.8).size.width,
  )
  expect(createSilkscreenTextFont("WWW\nIII", 0.8).size.width).toBe(
    createSilkscreenTextFont("WWW", 0.8).size.width,
  )
  for (const text of ["", "\n", "温度", "${REFERENCE}", "A\tB", "~{RESET}"]) {
    expect(createSilkscreenTextFont(text, 0.8).size.width).toBe(0.8)
  }
  expect(createSilkscreenTextFont("test", 0).size.height).toBe(1)
})

import { expect, test } from "bun:test"
import "bun-match-svg"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

// https://github.com/tscircuit/circuit-json-to-kicad/issues/362
test("bottom-side footprint silkscreen text is emitted on B.SilkS as user fp_text and not dropped", async () => {
  const circuit = new Circuit()
  const FP = (
    <footprint>
      <smtpad
        portHints={["pin1"]}
        pcbX="-2mm"
        pcbY="0mm"
        width="1.6mm"
        height="2.6mm"
        shape="rect"
      />
      <smtpad
        portHints={["pin2"]}
        pcbX="2mm"
        pcbY="0mm"
        width="1.6mm"
        height="2.6mm"
        shape="rect"
      />
      <silkscreentext text="+" pcbX="-3.9mm" pcbY="0mm" fontSize="1mm" />
      <silkscreentext text="BT1" pcbX="0mm" pcbY="-2.3mm" fontSize="0.8mm" />
    </footprint>
  )

  circuit.add(
    <board width="14mm" height="10mm" routingDisabled>
      <chip name="BT1" footprint={FP} layer="bottom" pcbX={0} pcbY={0} />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  // Also simulate an unflipped top-layer silkscreen text inside a bottom footprint
  for (const el of circuitJson) {
    if (el.type === "pcb_silkscreen_text" && el.text === "+") {
      el.layer = "top"
    }
  }

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = converter.getOutputString()

  const blocks = pcb.split("(footprint").slice(1)
  const bt1Block = blocks.find((b) => /"Reference"\s+"BT1"/.test(b))
  expect(bt1Block).toBeDefined()

  expect(bt1Block).toMatch(/\(layer B\.Cu\)/)
  expect(bt1Block).not.toMatch(/\(layer F\.SilkS\)/)
  expect(bt1Block).not.toMatch(/\(layer F\.Fab\)/)

  const plusText = bt1Block!.match(
    /\(fp_text\s+user\s+"\+"[\s\S]*?\(layer\s+([^)]+)\)[\s\S]*?\(justify\s+mirror\)/,
  )
  expect(plusText).not.toBeNull()
  expect(plusText![1]).toBe("B.SilkS")

  const labelText = bt1Block!.match(
    /\(fp_text\s+user\s+"BT1"[\s\S]*?\(layer\s+([^)]+)\)[\s\S]*?\(justify\s+mirror\)/,
  )
  expect(labelText).not.toBeNull()
  expect(labelText![1]).toBe("B.SilkS")

  const kicadToCircuitJson = new KicadToCircuitJsonConverter()
  kicadToCircuitJson.addFile("board.kicad_pcb", pcb)
  kicadToCircuitJson.runUntilFinished()
  const roundTrippedJson = kicadToCircuitJson.getOutput()

  const svg = convertCircuitJsonToPcbSvg(roundTrippedJson)
  expect(svg).toMatchSvgSnapshot(import.meta.path)
})

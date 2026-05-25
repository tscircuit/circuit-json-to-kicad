import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

const Repro20SmtPadPillShape = () => (
  <board width="8mm" height="8mm" routingDisabled>
    <chip
      name="U1"
      footprint={
        <footprint>
          <smtpad
            shape="pill"
            layer="top"
            width="0.8mm"
            height="1.8mm"
            radius="0.4mm"
            pcbX="-1mm"
            portHints={["pin1"]}
          />
          <smtpad
            shape="pill"
            layer="top"
            width="0.8mm"
            height="1.8mm"
            radius="0.4mm"
            pcbX="1mm"
            portHints={["pin2"]}
          />
        </footprint>
      }
    />
  </board>
)

export default Repro20SmtPadPillShape

test("pcb repro20 pill-shaped smtpad", async () => {
  const circuit = new Circuit()
  circuit.add(<Repro20SmtPadPillShape />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  expect(() => KicadPcb.parse(outputString)).not.toThrow()
  expect(outputString).toContain(`(pad "1" smd roundrect`)
  expect(outputString).toContain(`(roundrect_rratio 0.5)`)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })

  expect(kicadSnapshot.exitCode).toBe(0)
  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "pcb",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})

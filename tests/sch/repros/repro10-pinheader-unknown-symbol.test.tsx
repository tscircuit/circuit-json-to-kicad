import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("repro10 pinheader schematic unknown symbol", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="30mm" height="30mm">
      <pinheader
        name="J2"
        pinCount={8}
        gender="male"
        pitch="2.54mm"
        footprint="pinrow8_rows2"
        doubleRow={true}
        showSilkscreenPinLabels={true}
        pinLabels={["VCC", "GND", "SDA", "SCL", "MISO", "MOSI", "SCK", "CS"]}
        pcbX={0}
        pcbY={10}
      />
      <connector
        name="J1"
        manufacturerPartNumber="AF_QTZB1_0"
        pinLabels={{
          pin1: ["VCC"],
          pin2: ["D_NEG"],
          pin3: ["D_POS"],
          pin4: ["GND"],
          pin5: ["EH1"],
          pin6: ["EH2"],
        }}
        footprint={
          <footprint>
            <hole pcbX="-2.5mm" pcbY="-2.125mm" diameter="1.3mm" />
            <hole pcbX="2.5mm" pcbY="-2.125mm" diameter="1.3mm" />
            <smtpad
              portHints={["pin1"]}
              pcbX="-3.5mm"
              pcbY="1.575mm"
              width="1.1mm"
              height="3.8mm"
              shape="rect"
            />
            <smtpad
              portHints={["pin2"]}
              pcbX="-1mm"
              pcbY="1.575mm"
              width="1.1mm"
              height="3.8mm"
              shape="rect"
            />
            <smtpad
              portHints={["pin3"]}
              pcbX="1mm"
              pcbY="1.575mm"
              width="1.1mm"
              height="3.8mm"
              shape="rect"
            />
            <smtpad
              portHints={["pin4"]}
              pcbX="3.5mm"
              pcbY="1.575mm"
              width="1.1mm"
              height="3.8mm"
              shape="rect"
            />
            <smtpad
              portHints={["pin5"]}
              pcbX="7.15mm"
              pcbY="-1.475mm"
              width="1.8mm"
              height="4mm"
              shape="rect"
            />
            <smtpad
              portHints={["pin6"]}
              pcbX="-7.15mm"
              pcbY="-1.475mm"
              width="1.8mm"
              height="4mm"
              shape="rect"
            />
          </footprint>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  Bun.write("./debug-output/repro10-pinheader-unknown-symbol.kicad_sch", output)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})

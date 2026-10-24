import sharp from "sharp"
import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"

test("KiCad vias inherit their own board defaults and retain explicit overrides", async () => {
  const circuit = new Circuit()
  circuit.add(
    <panel width={24} height={12}>
      {[
        { name: "TOP", x: -6 },
        { name: "BOTTOM", x: 6 },
      ].map(({ name, x }) => (
        <board
          key={name}
          name={name}
          width={10}
          height={10}
          pcbX={x}
          defaultViaTenting={name === "TOP" ? "top_tented" : "bottom_tented"}
          routingDisabled
        >
          <pcbnotetext
            text={`${name}: inherited / exposed / override`}
            pcbY={3}
            fontSize={0.4}
          />
          <via
            name="INHERITED"
            pcbX={-2}
            holeDiameter={0.3}
            outerDiameter={0.6}
          />
          <via
            name="EXPOSED"
            pcbX={0}
            holeDiameter={0.3}
            outerDiameter={0.6}
            tented="exposed"
          />
          <via
            name="OVERRIDE"
            pcbX={2}
            holeDiameter={0.3}
            outerDiameter={0.6}
            tented={name === "TOP" ? "bottom_tented" : "top_tented"}
          />
        </board>
      ))}
    </panel>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const viaNodes = output.match(/\(via\s[\s\S]*?(?=\n  \(|\n\))/g) ?? []
  const statuses = viaNodes
    .map(
      (via, viaIndex) =>
        `<text x="20" y="${25 + viaIndex * 20}" fill="#ffd166" font-family="sans-serif" font-size="16">Via ${viaIndex + 1}: ${via.match(/\(tenting[^\n]*\)/)?.[0] ?? "no exported tenting"}</text>`,
    )
    .join("")
  const svg = convertCircuitJsonToPcbSvg(circuitJson, {
    width: 1200,
    height: 900,
  }).replace("</svg>", `${statuses}</svg>`)
  await expect(sharp(Buffer.from(svg)).png().toBuffer()).toMatchPngSnapshot(
    import.meta.path,
  )
  expect(viaNodes).toHaveLength(6)
  expect(viaNodes.map((via) => via.match(/\(tenting[^\n]*\)/)?.[0])).toEqual([
    "(tenting (front yes) (back no))",
    "(tenting (front no) (back no))",
    "(tenting (front no) (back yes))",
    "(tenting (front no) (back yes))",
    "(tenting (front no) (back no))",
    "(tenting (front yes) (back no))",
  ])
})

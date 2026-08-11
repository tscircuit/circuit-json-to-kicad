import "bun-match-svg"
import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

interface FootprintLayerRow {
  referenceDesignator: string
  circuitJsonLayer: string
  expectedKicadLayer: string
  exportedKicadLayer: string
}

function renderFootprintLayerSvg(params: {
  footprintLayerRows: FootprintLayerRow[]
}): string {
  const rowMarkup = params.footprintLayerRows
    .map((footprintLayerRow, rowIndex) => {
      const y = 88 + rowIndex * 78
      const layersMatch =
        footprintLayerRow.expectedKicadLayer ===
        footprintLayerRow.exportedKicadLayer
      const statusColor = layersMatch ? "#15803d" : "#dc2626"
      const statusBackground = layersMatch ? "#dcfce7" : "#fee2e2"
      const statusText = layersMatch ? "MATCH" : "MISMATCH"

      return `
    <g>
      <rect x="20" y="${y}" width="720" height="58" rx="8" fill="#f8fafc" stroke="#cbd5e1" />
      <text x="44" y="${y + 35}" class="component">${footprintLayerRow.referenceDesignator}</text>
      <text x="155" y="${y + 35}" class="layer">${footprintLayerRow.circuitJsonLayer}</text>
      <path d="M 245 ${y + 29} H 278" stroke="#64748b" stroke-width="2" />
      <path d="M 272 ${y + 23} L 280 ${y + 29} L 272 ${y + 35}" fill="none" stroke="#64748b" stroke-width="2" />
      <text x="302" y="${y + 35}" class="layer">${footprintLayerRow.expectedKicadLayer}</text>
      <path d="M 393 ${y + 29} H 426" stroke="#64748b" stroke-width="2" />
      <path d="M 420 ${y + 23} L 428 ${y + 29} L 420 ${y + 35}" fill="none" stroke="#64748b" stroke-width="2" />
      <rect x="450" y="${y + 13}" width="92" height="32" rx="16" fill="${statusBackground}" />
      <text x="496" y="${y + 35}" text-anchor="middle" class="actual" fill="${statusColor}">${footprintLayerRow.exportedKicadLayer}</text>
      <rect x="580" y="${y + 13}" width="132" height="32" rx="16" fill="${statusBackground}" />
      <text x="646" y="${y + 35}" text-anchor="middle" class="status" fill="${statusColor}">${statusText}</text>
    </g>`
    })
    .join("")

  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="270" viewBox="0 0 760 270">
  <style>
    text { font-family: Arial, sans-serif; fill: #0f172a; }
    .title { font-size: 22px; font-weight: 700; }
    .heading { font-size: 12px; font-weight: 700; fill: #475569; }
    .component { font-size: 17px; font-weight: 700; }
    .layer { font-size: 15px; }
    .actual { font-size: 14px; font-weight: 700; }
    .status { font-size: 12px; font-weight: 700; letter-spacing: 0.5px; }
  </style>
  <rect width="760" height="270" fill="#ffffff" />
  <text x="20" y="34" class="title">Bottom footprint layer export</text>
  <text x="44" y="70" class="heading">COMPONENT</text>
  <text x="155" y="70" class="heading">CIRCUIT JSON</text>
  <text x="302" y="70" class="heading">EXPECTED KICAD</text>
  <text x="450" y="70" class="heading">EXPORTED KICAD</text>
  <text x="608" y="70" class="heading">RESULT</text>
  ${rowMarkup}
</svg>`
}

test("pcb repro30 bottom footprint layer export", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        layer="bottom"
        pcbX={2}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const pcbComponents = circuitJson.filter(
    (circuitElement) => circuitElement.type === "pcb_component",
  )
  const kicadFootprints = converter.getOutput().footprints
  const referenceDesignators = ["R1", "C1"]
  const footprintLayerRows = pcbComponents.map((pcbComponent, index) => ({
    referenceDesignator:
      referenceDesignators[index] ?? `Component ${index + 1}`,
    circuitJsonLayer: pcbComponent.layer,
    expectedKicadLayer: pcbComponent.layer === "bottom" ? "B.Cu" : "F.Cu",
    exportedKicadLayer:
      kicadFootprints[index]?.layer
        ?.getString()
        .match(/\(layer ([^)]+)\)/)?.[1] ?? "missing",
  }))

  await expect(
    renderFootprintLayerSvg({ footprintLayerRows }),
  ).toMatchSvgSnapshot(import.meta.path)
})

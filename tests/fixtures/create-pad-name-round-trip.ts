import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../lib/pcb/CircuitJsonToKicadPcbConverter"

export function createPadNameRoundTrip({
  padType,
  connected,
}: {
  padType: "smd" | "thru_hole"
  connected: boolean
}) {
  // MP1 is deliberately the fifth pad so sequential fallback produces "5".
  const padNames = ["A1", "A2", "3", "B2", "MP1", "SH2"]
  const pads = padNames
    .map(
      (name, index) => `
        (pad "${name}" ${padType} ${padType === "smd" ? "rect" : "circle"}
          (at ${index * 2 - 5} 0)
          (size 1 1)
          ${padType === "thru_hole" ? "(drill 0.5)" : ""}
          (layers ${padType === "smd" ? '"F.Cu" "F.Mask"' : '"*.Cu" "*.Mask"'})
          ${connected ? '(net 1 "TEST")' : ""}
        )`,
    )
    .join("\n")
  const sourceText = `(kicad_pcb
    (version 20241229)
    (generator pcbnew)
    (general (thickness 1.6))
    (paper "A4")
    (layers
      (0 "F.Cu" signal)
      (31 "B.Cu" signal)
      (37 "F.SilkS" user)
      (38 "B.Mask" user)
      (39 "F.Mask" user)
      (44 "Edge.Cuts" user)
    )
    (net 0 "")
    (net 1 "TEST")
    (footprint "Test:PadIdentity" (layer "F.Cu")
      (uuid "d2dbf22c-8cf4-42d7-a2fd-742c9df913a4")
      (at 100 100)
      (property "Reference" "J1" (at 0 -3) (layer "F.SilkS")
        (effects (font (size 1 1))))
      (property "Value" "PadIdentity" (at 0 3) (layer "F.SilkS")
        (effects (font (size 1 1))))
      ${pads}
    )
    (gr_rect (start 90 90) (end 110 110)
      (stroke (width 0.05) (type default))
      (fill none) (layer "Edge.Cuts"))
  )`

  const importer = new KicadToCircuitJsonConverter()
  importer.addFile("pad-identity.kicad_pcb", sourceText)
  importer.runUntilFinished()
  const circuitJson = importer.getOutput()

  const exporter = new CircuitJsonToKicadPcbConverter(circuitJson)
  exporter.runUntilFinished()

  return {
    circuitJson,
    source: parseKicadPcb(sourceText),
    output: parseKicadPcb(exporter.getOutputString()),
  }
}

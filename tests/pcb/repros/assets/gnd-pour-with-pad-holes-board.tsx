// A ground pour with three clearance holes (pads on other nets), the same
// shape as the bottom GND pour of a soil pump controller.
export const GndPourWithPadHolesBoard = () => (
  <board width="20mm" height="12mm" routingDisabled schematicDisabled>
    <resistor name="R1" resistance="1k" footprint="0805" pcbX={-4} />
    <resistor name="R2" resistance="1k" footprint="0805" pcbX={4} />
    <trace from=".R1 > .pin1" to="net.SIG_A" />
    <trace from=".R1 > .pin2" to="net.SIG_B" />
    <trace from=".R2 > .pin1" to="net.SIG_C" />
    <trace from=".R2 > .pin2" to="net.GND" />
    <copperpour connectsTo="net.GND" layer="top" clearance="0.3mm" />
  </board>
)

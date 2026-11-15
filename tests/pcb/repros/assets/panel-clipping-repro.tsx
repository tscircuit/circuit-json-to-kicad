export const PanelClippingRepro = ({
  rounded = false,
}: {
  rounded?: boolean
}) => (
  <panel
    layoutMode="grid"
    row={2}
    col={2}
    boardGap="2mm"
    panelizationMethod="tab-routing"
    tabLength="3mm"
  >
    {Array.from({ length: 4 }, (_, index) => (
      <board
        key={index}
        width="14mm"
        height="18mm"
        borderRadius={rounded ? "2mm" : undefined}
        schematicDisabled
      >
        <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
        <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={2} />
        <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      </board>
    ))}
  </panel>
)

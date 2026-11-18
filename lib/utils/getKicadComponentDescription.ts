const DESCRIPTION_BY_FTYPE: Record<string, string> = {
  simple_resistor: "Resistor",
  simple_capacitor: "Capacitor",
  simple_inductor: "Inductor",
  simple_crystal: "Crystal oscillator",
  simple_diode: "Diode",
  simple_chip: "Integrated Circuit",
  simple_led: "LED",
  simple_switch: "Switch",
  simple_potentiometer: "Potentiometer",
  simple_connector: "Connector",
}

/**
 * Description written to both the schematic symbol and the PCB footprint, so
 * KiCad's schematic parity check sees the same value on both sides.
 */
export const getKicadComponentDescription = (ftype: string | undefined) =>
  (ftype && DESCRIPTION_BY_FTYPE[ftype]) || "Component"

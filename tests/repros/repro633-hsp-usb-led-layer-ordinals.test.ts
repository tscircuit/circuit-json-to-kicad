import { expect, test } from "bun:test"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib"

// hsp-usb-led is a real KiCad 9 board. Exporting it keeps the
// (version 20241229) stamp, so every layer must keep its KiCad 9 ordinal.
// EasyEDA Pro's KiCad importer reads layers by ordinal and crashes on the
// KiCad 8 numbers (#633).
test.failing("repro633: hsp-usb-led keeps its KiCad 9 layer ordinals on export", async () => {
  const source = await Bun.file(
    new URL("../../references/hsp-usb-led.kicad_pcb", import.meta.url),
  ).text()
  const importer = new KicadToCircuitJsonConverter()
  importer.addFile("hsp-usb-led.kicad_pcb", source)
  importer.runUntilFinished()

  const converter = new CircuitJsonToKicadPcbConverter(importer.getOutput())
  converter.runUntilFinished()
  const output = converter.getOutputString()
  expect(output).toContain("(version 20241229)")

  const getOrdinals = (kicadPcb: string) =>
    Object.fromEntries(
      parseKicadPcb(kicadPcb).layers!.definitions.map((definition) => [
        definition.name,
        definition.index,
      ]),
    )
  const sourceOrdinals = getOrdinals(source)
  const exportedOrdinals = getOrdinals(output)

  expect(
    Object.fromEntries(
      Object.keys(sourceOrdinals).map((name) => [name, exportedOrdinals[name]]),
    ),
  ).toEqual(sourceOrdinals)
})

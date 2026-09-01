import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

type ReferenceSpec = {
  filename: string
  sha256: string
  source: string
  url: string
}

const references: ReferenceSpec[] = [
  {
    filename: "hsp-usb-led.kicad_pcb",
    sha256: "a8e69c14ceec9dd0954c3027cc89ca6bbb9c0b0ec3aeede5feacfdd47736f362",
    source:
      "nushackers/hsp-pcb-intro@ad3fbd582e3915b585c453ea202f591720a1f427 (CERN-OHL-P-2.0)",
    url: "https://raw.githubusercontent.com/nushackers/hsp-pcb-intro/ad3fbd582e3915b585c453ea202f591720a1f427/src/usb_led.kicad_pcb",
  },
  {
    filename: "pan-tilt-home-sensor.kicad_pcb",
    sha256: "0bdbcaae7885bf089ede886984ad5b1c725b9a707c7f097428eb79824d62e8aa",
    source:
      "mitmedialab/generic-pan-tilt-pcb@9a0c21770e967b68a4ab5e6a5ae65d44953b1125 (CERN-OHL-P-2.0-or-later)",
    url: "https://raw.githubusercontent.com/mitmedialab/generic-pan-tilt-pcb/9a0c21770e967b68a4ab5e6a5ae65d44953b1125/generic-pan-tilt-home-sensor-pcb/generic-pan-tilt-home-sensor-pcb.kicad_pcb",
  },
  {
    filename: "pi-switcher-plus.kicad_pcb",
    sha256: "bfb27fe00442a416d7417e8c3103e66887536839be0a67052239f4c2118f23cf",
    source:
      "FibStack/pi-switcher-plus@b6aa62230b8f575ec88e2d89ead4d9623be271ad (CERN-OHL-P-2.0)",
    url: "https://raw.githubusercontent.com/FibStack/pi-switcher-plus/b6aa62230b8f575ec88e2d89ead4d9623be271ad/piswitcher_plus_board/piswitcher_plus_board.kicad_pcb",
  },
  {
    filename: "precursor-lora.kicad_pcb",
    sha256: "12e612ce32cf735a2e2374c55926b0a60b42a6e2630da2588a2cce9440d88401",
    source:
      "tbcolby/PrecursorLoRa@e84111c8c31c1988bfdae4021e847dad46c6bfdb (CERN-OHL-P-2.0)",
    url: "https://raw.githubusercontent.com/tbcolby/PrecursorLoRa/e84111c8c31c1988bfdae4021e847dad46c6bfdb/hardware/precursor-lora.kicad_pcb",
  },
  {
    filename: "soil-moisture-sensor.kicad_pcb",
    sha256: "d30e14c54b5361c7e90debc239906d8502570a072cc6afb11bbcb118fec2c484",
    source:
      "RonMcKay/capacitive-soil-moisture-sensor@d252a7cbcbff4727b947b9d368cec6be50aa740a (CERN-OHL-P-2.0)",
    url: "https://raw.githubusercontent.com/RonMcKay/capacitive-soil-moisture-sensor/d252a7cbcbff4727b947b9d368cec6be50aa740a/hardware/soil-moisture-sensor.kicad_pcb",
  },
  {
    filename: "hsp-usb-led.kicad_sch",
    sha256: "425a817f1c236363eefd6ff8cb23365d2641a43d5f1e057191497046dcf20d75",
    source:
      "nushackers/hsp-pcb-intro@ad3fbd582e3915b585c453ea202f591720a1f427 (CERN-OHL-P-2.0)",
    url: "https://raw.githubusercontent.com/nushackers/hsp-pcb-intro/ad3fbd582e3915b585c453ea202f591720a1f427/src/usb_led.kicad_sch",
  },
  {
    filename: "pan-tilt-home-sensor.kicad_sch",
    sha256: "8c8d13e25e8f0859e477887dc38d267d20c6f9c5b28f5dab8bd62fa5f9955497",
    source:
      "mitmedialab/generic-pan-tilt-pcb@9a0c21770e967b68a4ab5e6a5ae65d44953b1125 (CERN-OHL-P-2.0-or-later)",
    url: "https://raw.githubusercontent.com/mitmedialab/generic-pan-tilt-pcb/9a0c21770e967b68a4ab5e6a5ae65d44953b1125/generic-pan-tilt-home-sensor-pcb/generic-pan-tilt-home-sensor-pcb.kicad_sch",
  },
  {
    filename: "pi-switcher-plus.kicad_sch",
    sha256: "9f4f675c68ff69f8ba76abd7d92c29cd4baeb7b55a20360b55f6ab28158c7f9b",
    source:
      "FibStack/pi-switcher-plus@b6aa62230b8f575ec88e2d89ead4d9623be271ad (CERN-OHL-P-2.0)",
    url: "https://raw.githubusercontent.com/FibStack/pi-switcher-plus/b6aa62230b8f575ec88e2d89ead4d9623be271ad/piswitcher_plus_board/piswitcher_plus_board.kicad_sch",
  },
  {
    filename: "precursor-lora.kicad_sch",
    sha256: "99e4da080acf2f157fff426a9c76624159885887596c9ffc7900f0cde0e07999",
    source:
      "tbcolby/PrecursorLoRa@e84111c8c31c1988bfdae4021e847dad46c6bfdb (CERN-OHL-P-2.0)",
    url: "https://raw.githubusercontent.com/tbcolby/PrecursorLoRa/e84111c8c31c1988bfdae4021e847dad46c6bfdb/hardware/precursor-lora.kicad_sch",
  },
  {
    filename: "soil-moisture-sensor.kicad_sch",
    sha256: "abc5701a9b4aafda7eecdeabcef5036f6542da40062089932822a2718c1961a4",
    source:
      "RonMcKay/capacitive-soil-moisture-sensor@d252a7cbcbff4727b947b9d368cec6be50aa740a (CERN-OHL-P-2.0)",
    url: "https://raw.githubusercontent.com/RonMcKay/capacitive-soil-moisture-sensor/d252a7cbcbff4727b947b9d368cec6be50aa740a/hardware/soil-moisture-sensor.kicad_sch",
  },
  {
    filename: "ebaz4205.kicad_sch",
    sha256: "06621d4ff2242c6b5dccb1ea206e28e28ed1f0a982d8a4aba43e76e1bdf1c8d8",
    source: "xjtuecho/EBAZ4205@05cdb45035a06fc5b4db16babf0ac6f4ee4497be (MIT)",
    url: "https://raw.githubusercontent.com/xjtuecho/EBAZ4205/05cdb45035a06fc5b4db16babf0ac6f4ee4497be/HW/ebaz4205/kicad/ebaz4205.kicad_sch",
  },
  {
    filename: "IO.kicad_sch",
    sha256: "9cd4d405392d284f626f6604e9e0f8cfde1f69ffb187671f9fd7127748b46da5",
    source: "xjtuecho/EBAZ4205@05cdb45035a06fc5b4db16babf0ac6f4ee4497be (MIT)",
    url: "https://raw.githubusercontent.com/xjtuecho/EBAZ4205/05cdb45035a06fc5b4db16babf0ac6f4ee4497be/HW/ebaz4205/kicad/IO.kicad_sch",
  },
  {
    filename: "Mem_Zynq.kicad_sch",
    sha256: "748b87a774dd81162cf63435e22be03773d448029f089e869df8e07b3c32f249",
    source: "xjtuecho/EBAZ4205@05cdb45035a06fc5b4db16babf0ac6f4ee4497be (MIT)",
    url: "https://raw.githubusercontent.com/xjtuecho/EBAZ4205/05cdb45035a06fc5b4db16babf0ac6f4ee4497be/HW/ebaz4205/kicad/Mem_Zynq.kicad_sch",
  },
  {
    filename: "Phy-Sun.kicad_sch",
    sha256: "b031e9590b179ba86cf6f8b2521853c9e9f8cdf99ef9f8c40073cdc909ac7930",
    source: "xjtuecho/EBAZ4205@05cdb45035a06fc5b4db16babf0ac6f4ee4497be (MIT)",
    url: "https://raw.githubusercontent.com/xjtuecho/EBAZ4205/05cdb45035a06fc5b4db16babf0ac6f4ee4497be/HW/ebaz4205/kicad/Phy-Sun.kicad_sch",
  },
  {
    filename: "Zynq_IO.kicad_sch",
    sha256: "38f5aac5c8b70bddbce07e42f3f6ce7c71d90674d0ae34b835cdc2342578a2f2",
    source: "xjtuecho/EBAZ4205@05cdb45035a06fc5b4db16babf0ac6f4ee4497be (MIT)",
    url: "https://raw.githubusercontent.com/xjtuecho/EBAZ4205/05cdb45035a06fc5b4db16babf0ac6f4ee4497be/HW/ebaz4205/kicad/Zynq_IO.kicad_sch",
  },
  {
    filename: "Zynq_Pwr.kicad_sch",
    sha256: "a465e1de8cc85dd9bdbd3ff37909d69693197c2913f9c93b7bd4f7c2a568f96d",
    source: "xjtuecho/EBAZ4205@05cdb45035a06fc5b4db16babf0ac6f4ee4497be (MIT)",
    url: "https://raw.githubusercontent.com/xjtuecho/EBAZ4205/05cdb45035a06fc5b4db16babf0ac6f4ee4497be/HW/ebaz4205/kicad/Zynq_Pwr.kicad_sch",
  },
]

const referencesDirectory = resolve(import.meta.dir, "..", "references")

async function downloadReference(reference: ReferenceSpec): Promise<void> {
  const response = await fetch(reference.url)
  if (!response.ok) {
    throw new Error(
      `${reference.url} (${response.status} ${response.statusText})`,
    )
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  const actualHash = createHash("sha256").update(bytes).digest("hex")
  if (actualHash !== reference.sha256) {
    throw new Error(
      `${reference.filename} SHA-256 mismatch: expected ${reference.sha256}, got ${actualHash}`,
    )
  }

  await writeFile(resolve(referencesDirectory, reference.filename), bytes)
  console.log(
    `Saved ${reference.filename} (${bytes.byteLength} bytes) from ${reference.source}`,
  )
}

await mkdir(referencesDirectory, { recursive: true })
await Promise.all(references.map(downloadReference))

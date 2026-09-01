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

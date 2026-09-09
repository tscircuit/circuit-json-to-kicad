# Open-source KiCad references

Run `bun run download-references` to download real KiCad boards and matching
schematics from immutable GitHub revisions. The source files are ignored by Git
and are not distributed under this repository's MIT license. The download
script verifies each file's SHA-256 digest before writing it.

## Boards

| Local file | Upstream file | Revision | License | Bytes | SHA-256 |
| --- | --- | --- | --- | ---: | --- |
| `hsp-usb-led.kicad_pcb` | [`nushackers/hsp-pcb-intro/src/usb_led.kicad_pcb`](https://github.com/nushackers/hsp-pcb-intro/blob/ad3fbd582e3915b585c453ea202f591720a1f427/src/usb_led.kicad_pcb) | `ad3fbd582e3915b585c453ea202f591720a1f427` | CERN-OHL-P-2.0 | 77,214 | `a8e69c14ceec9dd0954c3027cc89ca6bbb9c0b0ec3aeede5feacfdd47736f362` |
| `pan-tilt-home-sensor.kicad_pcb` | [`mitmedialab/generic-pan-tilt-pcb/generic-pan-tilt-home-sensor-pcb.kicad_pcb`](https://github.com/mitmedialab/generic-pan-tilt-pcb/blob/9a0c21770e967b68a4ab5e6a5ae65d44953b1125/generic-pan-tilt-home-sensor-pcb/generic-pan-tilt-home-sensor-pcb.kicad_pcb) | `9a0c21770e967b68a4ab5e6a5ae65d44953b1125` | CERN-OHL-P-2.0-or-later | 117,802 | `0bdbcaae7885bf089ede886984ad5b1c725b9a707c7f097428eb79824d62e8aa` |
| `pi-switcher-plus.kicad_pcb` | [`FibStack/pi-switcher-plus/piswitcher_plus_board.kicad_pcb`](https://github.com/FibStack/pi-switcher-plus/blob/b6aa62230b8f575ec88e2d89ead4d9623be271ad/piswitcher_plus_board/piswitcher_plus_board.kicad_pcb) | `b6aa62230b8f575ec88e2d89ead4d9623be271ad` | CERN-OHL-P-2.0 | 342,111 | `bfb27fe00442a416d7417e8c3103e66887536839be0a67052239f4c2118f23cf` |
| `precursor-lora.kicad_pcb` | [`tbcolby/PrecursorLoRa/hardware/precursor-lora.kicad_pcb`](https://github.com/tbcolby/PrecursorLoRa/blob/e84111c8c31c1988bfdae4021e847dad46c6bfdb/hardware/precursor-lora.kicad_pcb) | `e84111c8c31c1988bfdae4021e847dad46c6bfdb` | CERN-OHL-P-2.0 | 154,476 | `12e612ce32cf735a2e2374c55926b0a60b42a6e2630da2588a2cce9440d88401` |
| `soil-moisture-sensor.kicad_pcb` | [`RonMcKay/capacitive-soil-moisture-sensor/hardware/soil-moisture-sensor.kicad_pcb`](https://github.com/RonMcKay/capacitive-soil-moisture-sensor/blob/d252a7cbcbff4727b947b9d368cec6be50aa740a/hardware/soil-moisture-sensor.kicad_pcb) | `d252a7cbcbff4727b947b9d368cec6be50aa740a` | CERN-OHL-P-2.0 | 354,222 | `d30e14c54b5361c7e90debc239906d8502570a072cc6afb11bbcb118fec2c484` |

## Schematics

The first five schematics match the boards above. EBAZ4205 is the one Altium
PCB fixture whose upstream project has no `.SchDoc`; its six-sheet KiCad
schematic is included here so every open-source PCB fixture across both
converter repositories has a visual schematic snapshot.

| Local file | Upstream file | Revision | License | Bytes | SHA-256 |
| --- | --- | --- | --- | ---: | --- |
| `hsp-usb-led.kicad_sch` | [`nushackers/hsp-pcb-intro/src/usb_led.kicad_sch`](https://github.com/nushackers/hsp-pcb-intro/blob/ad3fbd582e3915b585c453ea202f591720a1f427/src/usb_led.kicad_sch) | `ad3fbd582e3915b585c453ea202f591720a1f427` | CERN-OHL-P-2.0 | 35,102 | `425a817f1c236363eefd6ff8cb23365d2641a43d5f1e057191497046dcf20d75` |
| `pan-tilt-home-sensor.kicad_sch` | [`mitmedialab/generic-pan-tilt-pcb/generic-pan-tilt-home-sensor-pcb.kicad_sch`](https://github.com/mitmedialab/generic-pan-tilt-pcb/blob/9a0c21770e967b68a4ab5e6a5ae65d44953b1125/generic-pan-tilt-home-sensor-pcb/generic-pan-tilt-home-sensor-pcb.kicad_sch) | `9a0c21770e967b68a4ab5e6a5ae65d44953b1125` | CERN-OHL-P-2.0-or-later | 46,900 | `8c8d13e25e8f0859e477887dc38d267d20c6f9c5b28f5dab8bd62fa5f9955497` |
| `pi-switcher-plus.kicad_sch` | [`FibStack/pi-switcher-plus/piswitcher_plus_board.kicad_sch`](https://github.com/FibStack/pi-switcher-plus/blob/b6aa62230b8f575ec88e2d89ead4d9623be271ad/piswitcher_plus_board/piswitcher_plus_board.kicad_sch) | `b6aa62230b8f575ec88e2d89ead4d9623be271ad` | CERN-OHL-P-2.0 | 176,167 | `9f4f675c68ff69f8ba76abd7d92c29cd4baeb7b55a20360b55f6ab28158c7f9b` |
| `precursor-lora.kicad_sch` | [`tbcolby/PrecursorLoRa/hardware/precursor-lora.kicad_sch`](https://github.com/tbcolby/PrecursorLoRa/blob/e84111c8c31c1988bfdae4021e847dad46c6bfdb/hardware/precursor-lora.kicad_sch) | `e84111c8c31c1988bfdae4021e847dad46c6bfdb` | CERN-OHL-P-2.0 | 80,584 | `99e4da080acf2f157fff426a9c76624159885887596c9ffc7900f0cde0e07999` |
| `soil-moisture-sensor.kicad_sch` | [`RonMcKay/capacitive-soil-moisture-sensor/hardware/soil-moisture-sensor.kicad_sch`](https://github.com/RonMcKay/capacitive-soil-moisture-sensor/blob/d252a7cbcbff4727b947b9d368cec6be50aa740a/hardware/soil-moisture-sensor.kicad_sch) | `d252a7cbcbff4727b947b9d368cec6be50aa740a` | CERN-OHL-P-2.0 | 93,791 | `abc5701a9b4aafda7eecdeabcef5036f6542da40062089932822a2718c1961a4` |
| `ebaz4205.kicad_sch` | [`xjtuecho/EBAZ4205/ebaz4205.kicad_sch`](https://github.com/xjtuecho/EBAZ4205/blob/05cdb45035a06fc5b4db16babf0ac6f4ee4497be/HW/ebaz4205/kicad/ebaz4205.kicad_sch) | `05cdb45035a06fc5b4db16babf0ac6f4ee4497be` | MIT | 270,657 | `06621d4ff2242c6b5dccb1ea206e28e28ed1f0a982d8a4aba43e76e1bdf1c8d8` |
| `IO.kicad_sch` | [`xjtuecho/EBAZ4205/IO.kicad_sch`](https://github.com/xjtuecho/EBAZ4205/blob/05cdb45035a06fc5b4db16babf0ac6f4ee4497be/HW/ebaz4205/kicad/IO.kicad_sch) | `05cdb45035a06fc5b4db16babf0ac6f4ee4497be` | MIT | 257,755 | `9cd4d405392d284f626f6604e9e0f8cfde1f69ffb187671f9fd7127748b46da5` |
| `Mem_Zynq.kicad_sch` | [`xjtuecho/EBAZ4205/Mem_Zynq.kicad_sch`](https://github.com/xjtuecho/EBAZ4205/blob/05cdb45035a06fc5b4db16babf0ac6f4ee4497be/HW/ebaz4205/kicad/Mem_Zynq.kicad_sch) | `05cdb45035a06fc5b4db16babf0ac6f4ee4497be` | MIT | 429,932 | `748b87a774dd81162cf63435e22be03773d448029f089e869df8e07b3c32f249` |
| `Phy-Sun.kicad_sch` | [`xjtuecho/EBAZ4205/Phy-Sun.kicad_sch`](https://github.com/xjtuecho/EBAZ4205/blob/05cdb45035a06fc5b4db16babf0ac6f4ee4497be/HW/ebaz4205/kicad/Phy-Sun.kicad_sch) | `05cdb45035a06fc5b4db16babf0ac6f4ee4497be` | MIT | 240,757 | `b031e9590b179ba86cf6f8b2521853c9e9f8cdf99ef9f8c40073cdc909ac7930` |
| `Zynq_IO.kicad_sch` | [`xjtuecho/EBAZ4205/Zynq_IO.kicad_sch`](https://github.com/xjtuecho/EBAZ4205/blob/05cdb45035a06fc5b4db16babf0ac6f4ee4497be/HW/ebaz4205/kicad/Zynq_IO.kicad_sch) | `05cdb45035a06fc5b4db16babf0ac6f4ee4497be` | MIT | 249,994 | `38f5aac5c8b70bddbce07e42f3f6ce7c71d90674d0ae34b835cdc2342578a2f2` |
| `Zynq_Pwr.kicad_sch` | [`xjtuecho/EBAZ4205/Zynq_Pwr.kicad_sch`](https://github.com/xjtuecho/EBAZ4205/blob/05cdb45035a06fc5b4db16babf0ac6f4ee4497be/HW/ebaz4205/kicad/Zynq_Pwr.kicad_sch) | `05cdb45035a06fc5b4db16babf0ac6f4ee4497be` | MIT | 267,819 | `a465e1de8cc85dd9bdbd3ff37909d69693197c2913f9c93b7bd4f7c2a568f96d` |

The license notices are embedded in the boards' title blocks or silkscreen, and
the upstream repositories provide their complete license terms. Every test
parses a source board into Circuit JSON with `kicad-to-circuit-json`, converts
that Circuit JSON back to KiCad with this package, and reopens the generated
file with `kicadts`.

The assertions cover exact supported footprint, pad, routed-segment, via,
copper-pour, and net-name preservation. The board and schematic tests store
source/generated side-by-side native KiCad renders, including every source
sheet in hierarchical schematics.

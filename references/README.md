# Open-source KiCad references

Run `bun run download-references` to download five real KiCad boards from
immutable GitHub revisions. The board files are ignored by Git and are not
distributed under this repository's MIT license. The download script verifies
each file's SHA-256 digest before writing it.

| Local file | Upstream file | Revision | License | Bytes | SHA-256 |
| --- | --- | --- | --- | ---: | --- |
| `hsp-usb-led.kicad_pcb` | [`nushackers/hsp-pcb-intro/src/usb_led.kicad_pcb`](https://github.com/nushackers/hsp-pcb-intro/blob/ad3fbd582e3915b585c453ea202f591720a1f427/src/usb_led.kicad_pcb) | `ad3fbd582e3915b585c453ea202f591720a1f427` | CERN-OHL-P-2.0 | 77,214 | `a8e69c14ceec9dd0954c3027cc89ca6bbb9c0b0ec3aeede5feacfdd47736f362` |
| `pan-tilt-home-sensor.kicad_pcb` | [`mitmedialab/generic-pan-tilt-pcb/generic-pan-tilt-home-sensor-pcb.kicad_pcb`](https://github.com/mitmedialab/generic-pan-tilt-pcb/blob/9a0c21770e967b68a4ab5e6a5ae65d44953b1125/generic-pan-tilt-home-sensor-pcb/generic-pan-tilt-home-sensor-pcb.kicad_pcb) | `9a0c21770e967b68a4ab5e6a5ae65d44953b1125` | CERN-OHL-P-2.0-or-later | 117,802 | `0bdbcaae7885bf089ede886984ad5b1c725b9a707c7f097428eb79824d62e8aa` |
| `pi-switcher-plus.kicad_pcb` | [`FibStack/pi-switcher-plus/piswitcher_plus_board.kicad_pcb`](https://github.com/FibStack/pi-switcher-plus/blob/b6aa62230b8f575ec88e2d89ead4d9623be271ad/piswitcher_plus_board/piswitcher_plus_board.kicad_pcb) | `b6aa62230b8f575ec88e2d89ead4d9623be271ad` | CERN-OHL-P-2.0 | 342,111 | `bfb27fe00442a416d7417e8c3103e66887536839be0a67052239f4c2118f23cf` |
| `precursor-lora.kicad_pcb` | [`tbcolby/PrecursorLoRa/hardware/precursor-lora.kicad_pcb`](https://github.com/tbcolby/PrecursorLoRa/blob/e84111c8c31c1988bfdae4021e847dad46c6bfdb/hardware/precursor-lora.kicad_pcb) | `e84111c8c31c1988bfdae4021e847dad46c6bfdb` | CERN-OHL-P-2.0 | 154,476 | `12e612ce32cf735a2e2374c55926b0a60b42a6e2630da2588a2cce9440d88401` |
| `soil-moisture-sensor.kicad_pcb` | [`RonMcKay/capacitive-soil-moisture-sensor/hardware/soil-moisture-sensor.kicad_pcb`](https://github.com/RonMcKay/capacitive-soil-moisture-sensor/blob/d252a7cbcbff4727b947b9d368cec6be50aa740a/hardware/soil-moisture-sensor.kicad_pcb) | `d252a7cbcbff4727b947b9d368cec6be50aa740a` | CERN-OHL-P-2.0 | 354,222 | `d30e14c54b5361c7e90debc239906d8502570a072cc6afb11bbcb118fec2c484` |

The license notices are embedded in the boards' title blocks or silkscreen, and
the upstream repositories provide their complete license terms. Every test
parses a source board into Circuit JSON with `kicad-to-circuit-json`, converts
that Circuit JSON back to KiCad with this package, and reopens the generated
file with `kicadts`.

The assertions cover exact supported footprint, pad, routed-segment, via,
copper-pour, and net-name preservation. Each test also stores a source/generated
side-by-side KiCad render so unsupported visual details remain visible.

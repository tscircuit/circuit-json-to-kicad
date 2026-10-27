"""Run with KiCad's Python: verify-kicad.py /path/to/nema34-clearance.kicad_pcb."""
import json
import sys
import pcbnew

board = pcbnew.LoadBoard(sys.argv[1])
actual = sorted((z.GetNetname(), board.GetLayerName(z.GetLayer()),
                 pcbnew.ToMM(z.GetLocalClearance())) for z in board.Zones())
print(json.dumps(actual, indent=2))
assert actual == [("EFUSE_IN", "B.Cu", 0.16),
                  ("GND", "In1.Cu", 0.3), ("GND", "In1.Cu", 0.3)]

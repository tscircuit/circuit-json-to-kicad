import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { createSilkscreenTextFont } from "lib/pcb/stages/utils/createSilkscreenTextFont"

const python = process.env.KICAD_PYTHON ?? "python3"
const hasPcbnew = spawnSync(python, ["-c", "import pcbnew"]).status === 0

test.skipIf(!hasPcbnew)(
  "native KiCad bounding boxes fit the source allocation",
  () => {
    const texts = [
      "SN74LVC1G17DCKR",
      "WWW",
      "III",
      "R1",
      "Hello World",
      "WWW\nIII",
      ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32)),
    ]
    const cases = [0.4, 0.8, 1.5].flatMap((height) =>
      texts.map((text) => {
        const font = createSilkscreenTextFont(text, height)
        return {
          text,
          height,
          width: font.size.width,
          thickness: font.thickness,
        }
      }),
    )
    const result = spawnSync(
      python,
      [
        "-c",
        `
import json, sys, pcbnew
board = pcbnew.BOARD()
results = []
for case in json.load(sys.stdin):
    text = pcbnew.PCB_TEXT(board)
    text.SetText(case['text'])
    text.SetTextSize(pcbnew.VECTOR2I(round(case['width'] * 1e6), round(case['height'] * 1e6)))
    text.SetTextThickness(round(case['thickness'] * 1e6))
    results.append(text.GetBoundingBox().GetWidth() / 1e6)
print(json.dumps(results))
`,
      ],
      { input: JSON.stringify(cases), encoding: "utf8" },
    )
    expect(result.status, result.stderr).toBe(0)
    const widths: number[] = JSON.parse(result.stdout)
    cases.forEach((item, i) => {
      const target =
        Math.max(...item.text.split("\n").map((line) => line.length)) *
        item.height *
        0.6
      expect(widths[i]!, JSON.stringify(item)).toBeLessThanOrEqual(
        target + 0.00002,
      )
    })
  },
)

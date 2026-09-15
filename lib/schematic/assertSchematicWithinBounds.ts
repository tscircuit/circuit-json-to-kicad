import type { KicadSch } from "kicadts"
import { parseKicadSch } from "kicadts"
import { STANDARD_PAPER_DIMENSIONS_MM } from "./selectSchematicPaperSize"

export interface BoundsCheckViolation {
  elementType: string
  identifier?: string
  position: { x: number; y: number }
  paperBounds: { width: number; height: number }
  message: string
}

export interface BoundsCheckResult {
  isWithinBounds: boolean
  paperWidth: number
  paperHeight: number
  violations: BoundsCheckViolation[]
}

/**
 * Inspects all elements in a KiCad schematic (symbols, wires, net labels, text,
 * junctions, sheets, etc.) and determines whether any coordinates lie outside
 * the page boundaries.
 */
export function checkSchematicWithinBounds(
  kicadSchOrString: KicadSch | string,
  options: { toleranceMm?: number } = {},
): BoundsCheckResult {
  const tolerance = options.toleranceMm ?? 0.05
  const sch =
    typeof kicadSchOrString === "string"
      ? parseKicadSch(kicadSchOrString)
      : kicadSchOrString

  let paperWidth = 297
  let paperHeight = 210

  const paper = sch.paper
  if (paper?.customSize) {
    paperWidth = paper.customSize.width
    paperHeight = paper.customSize.height
  } else if (paper?.size) {
    const cleanSize = paper.size.replace(/"/g, "")
    const std = STANDARD_PAPER_DIMENSIONS_MM[cleanSize] ?? {
      width: 297,
      height: 210,
    }
    if (paper.isPortrait) {
      paperWidth = std.height
      paperHeight = std.width
    } else {
      paperWidth = std.width
      paperHeight = std.height
    }
  }

  const violations: BoundsCheckViolation[] = []

  const checkPoint = (
    x: number,
    y: number,
    elementType: string,
    identifier?: string,
  ) => {
    if (
      x < -tolerance ||
      x > paperWidth + tolerance ||
      y < -tolerance ||
      y > paperHeight + tolerance
    ) {
      violations.push({
        elementType,
        identifier,
        position: { x, y },
        paperBounds: { width: paperWidth, height: paperHeight },
        message: `${elementType}${identifier ? ` (${identifier})` : ""} at (${x.toFixed(2)}, ${y.toFixed(2)}) mm exceeds sheet boundary (0..${paperWidth}, 0..${paperHeight}) mm`,
      })
    }
  }

  // Check symbol locations
  if (sch.symbols) {
    for (const sym of sch.symbols) {
      if (sym.at) {
        checkPoint(sym.at.x, sym.at.y, "Symbol", sym.uuid?.toString())
      }
    }
  }

  // Check wire & bus points
  if (sch.wires) {
    for (const wire of sch.wires) {
      if (wire.points?.points) {
        for (const pt of wire.points.points) {
          checkPoint(pt.x, pt.y, "Wire")
        }
      }
    }
  }

  // Check local and global net labels
  if (sch.labels) {
    for (const label of sch.labels) {
      if (label.at) {
        checkPoint(label.at.x, label.at.y, "Label")
      }
    }
  }
  if (sch.globalLabels) {
    for (const gl of sch.globalLabels) {
      if (gl.at) {
        checkPoint(gl.at.x, gl.at.y, "GlobalLabel")
      }
    }
  }

  // Check texts and textBoxes
  if (sch.texts) {
    for (const txt of sch.texts) {
      if (txt.at) {
        checkPoint(txt.at.x, txt.at.y, "Text")
      }
    }
  }
  if (sch.textBoxes) {
    for (const tb of sch.textBoxes) {
      if (tb.at) {
        checkPoint(tb.at.x, tb.at.y, "TextBox")
      }
    }
  }

  // Check junctions
  if (sch.junctions) {
    for (const junc of sch.junctions) {
      if (junc.at) {
        checkPoint(junc.at.x, junc.at.y, "Junction")
      }
    }
  }

  // Check hierarchical child sheets
  if (sch.sheets) {
    for (const sheet of sch.sheets) {
      if (sheet.at) {
        checkPoint(sheet.at.x, sheet.at.y, "Sheet")
      }
    }
  }

  return {
    isWithinBounds: violations.length === 0,
    paperWidth,
    paperHeight,
    violations,
  }
}

/**
 * Asserts that all schematic elements lie strictly within the paper boundaries,
 * throwing an explicit overflow diagnostic Error if any elements are clipped.
 */
export function assertSchematicWithinBounds(
  kicadSchOrString: KicadSch | string,
  options: { toleranceMm?: number } = {},
): void {
  const result = checkSchematicWithinBounds(kicadSchOrString, options)
  if (!result.isWithinBounds) {
    const details = result.violations.map((v) => `  - ${v.message}`).join("\n")
    throw new Error(
      `Schematic content exceeds paper sheet bounds (${result.paperWidth} × ${result.paperHeight} mm):\n${details}`,
    )
  }
}

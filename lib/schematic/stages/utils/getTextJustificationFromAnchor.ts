export interface TextJustification {
  horizontal?: "left" | "right"
  vertical?: "top" | "bottom"
}

const LEFT_ANCHORS = new Set([
  "left",
  "top_left",
  "center_left",
  "middle_left",
  "bottom_left",
])

const RIGHT_ANCHORS = new Set([
  "right",
  "top_right",
  "center_right",
  "middle_right",
  "bottom_right",
])

const TOP_ANCHORS = new Set([
  "top",
  "top_left",
  "top_center",
  "top_right",
  "middle_top",
])

const BOTTOM_ANCHORS = new Set([
  "bottom",
  "bottom_left",
  "bottom_center",
  "bottom_right",
  "middle_bottom",
])

/**
 * Convert Circuit JSON and schematic-symbols text anchors to KiCad's
 * horizontal/vertical text justification model.
 */
export const getTextJustificationFromAnchor = (
  anchor?: string,
): TextJustification | undefined => {
  if (!anchor) return undefined

  const horizontal = LEFT_ANCHORS.has(anchor)
    ? "left"
    : RIGHT_ANCHORS.has(anchor)
      ? "right"
      : undefined
  const vertical = TOP_ANCHORS.has(anchor)
    ? "top"
    : BOTTOM_ANCHORS.has(anchor)
      ? "bottom"
      : undefined

  if (!horizontal && !vertical) return undefined

  return { horizontal, vertical }
}

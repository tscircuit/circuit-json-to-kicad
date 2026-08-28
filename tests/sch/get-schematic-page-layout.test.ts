import { expect, test } from "bun:test"
import { getSchematicPageLayout } from "../../lib/schematic/getSchematicPageLayout"

test("keeps tall A4 content above the title block", () => {
  const layout = getSchematicPageLayout({
    contentWidthMm: 155.1,
    contentHeightMm: 133.2,
  })

  expect(layout.paperSize.name).toBe("A4")
  expect(layout.contentCenter.y).toBeCloseTo(94.4)
  expect(layout.contentCenter.y + 133.2 / 2).toBeCloseTo(161)
})

test("promotes content that cannot clear the A4 title block", () => {
  const layout = getSchematicPageLayout({
    contentWidthMm: 160.5,
    contentHeightMm: 166.5,
  })

  expect(layout.paperSize.name).toBe("A3")
  expect(layout.contentCenter).toEqual({ x: 210, y: 148.5 })
})

test("shifts tall A3 content upward instead of entering the title block", () => {
  const layout = getSchematicPageLayout({
    contentWidthMm: 293.2,
    contentHeightMm: 216.9,
  })

  expect(layout.paperSize.name).toBe("A3")
  expect(layout.contentCenter.y).toBeCloseTo(139.55)
  expect(layout.contentCenter.y + 216.9 / 2).toBeCloseTo(248)
})

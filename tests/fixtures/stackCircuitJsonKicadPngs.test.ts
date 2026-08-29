import { expect, test } from "bun:test"
import sharp from "sharp"
import { createFocusedSchematicComparisonPanels } from "./stackCircuitJsonKicadPngs"

const comparisonBackground = { r: 245, g: 241, b: 237, alpha: 1 }

async function createSchematicPng({
  canvasWidth,
  canvasHeight,
  contentWidth,
  contentHeight,
  contentLeft,
  contentTop,
  background,
}: {
  canvasWidth: number
  canvasHeight: number
  contentWidth: number
  contentHeight: number
  contentLeft: number
  contentTop: number
  background: { r: number; g: number; b: number; alpha: number }
}) {
  const content = await sharp({
    create: {
      width: contentWidth,
      height: contentHeight,
      channels: 4,
      background: { r: 128, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background,
    },
  })
    .composite([{ input: content, left: contentLeft, top: contentTop }])
    .png()
    .toBuffer()
}

test("focused schematic panels crop margins without scaling content", async () => {
  const circuitJsonPng = await createSchematicPng({
    canvasWidth: 400,
    canvasHeight: 300,
    contentWidth: 80,
    contentHeight: 40,
    contentLeft: 120,
    contentTop: 80,
    background: comparisonBackground,
  })
  const kicadPng = await createSchematicPng({
    canvasWidth: 500,
    canvasHeight: 400,
    contentWidth: 100,
    contentHeight: 60,
    contentLeft: 160,
    contentTop: 120,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })

  const { circuitJsonPanel, kicadPanel } =
    await createFocusedSchematicComparisonPanels({
      circuitJsonPng,
      kicadPng,
    })

  const circuitJsonMetadata = await sharp(circuitJsonPanel).metadata()
  const kicadMetadata = await sharp(kicadPanel).metadata()

  expect([circuitJsonMetadata.width, circuitJsonMetadata.height]).toEqual([
    80 + 48 * 2,
    40 + 48 * 2,
  ])
  expect([kicadMetadata.width, kicadMetadata.height]).toEqual([
    100 + 48 * 2,
    60 + 48 * 2,
  ])
})

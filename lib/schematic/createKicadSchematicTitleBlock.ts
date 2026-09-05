import { TitleBlock, TitleBlockComment } from "kicadts"

export interface KicadSchematicTitleBlockMetadata {
  company?: string
  comments?: Array<{ index: number; text: string }>
  date?: string
  revision?: string
  title?: string
}

export function createKicadSchematicTitleBlock(
  metadata: KicadSchematicTitleBlockMetadata | undefined,
): TitleBlock | undefined {
  if (!metadata) return undefined

  return new TitleBlock({
    company: metadata.company,
    comments: metadata.comments?.map(
      ({ index, text }) => new TitleBlockComment(index, text),
    ),
    date: metadata.date,
    rev: metadata.revision,
    title: metadata.title,
  })
}

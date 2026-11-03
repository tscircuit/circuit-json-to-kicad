export const resolveKicadPcbNetName = (
  candidateName: string | undefined,
  connectivityKey: string,
  boardId?: string,
): string => {
  const name =
    candidateName && candidateName.trim().length > 0
      ? candidateName
      : connectivityKey
  return boardId ? `${boardId}/${name}` : name
}

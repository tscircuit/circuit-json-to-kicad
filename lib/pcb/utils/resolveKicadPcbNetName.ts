export const resolveKicadPcbNetName = (
  candidateName: string | undefined,
  connectivityKey: string,
): string =>
  candidateName && candidateName.trim().length > 0
    ? candidateName
    : connectivityKey

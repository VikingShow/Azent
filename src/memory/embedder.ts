export type Embedder = {
  doEmbed: (input: { values: string[] }) => Promise<{ embeddings: number[][] }>
}

let _embedder: Embedder | null | undefined = undefined

export async function getEmbedder(): Promise<Embedder | null> {
  if (_embedder !== undefined) return _embedder
  try {
    const { fastembed } = await import('@mastra/fastembed')
    _embedder = fastembed as unknown as Embedder
    return _embedder
  } catch {
    _embedder = null
    return null
  }
}

export function isEmbedderAvailable(): boolean {
  return _embedder !== null && _embedder !== undefined
}

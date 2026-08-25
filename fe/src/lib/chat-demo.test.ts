import { demoDocumentAnswer, demoLibraryAnswer } from './chat-demo'

describe('AI workspace demo fallback', () => {
  it('keeps document answers grounded in a visible citation', () => {
    const response = demoDocumentAnswer('What is consensus?')

    expect(response.answer).toContain('What is consensus?')
    expect(response.sources).toHaveLength(1)
    expect(response.sources[0].snippet).toBeTruthy()
  })

  it('returns ranked sources for library retrieval', () => {
    const response = demoLibraryAnswer('How should I validate a claim?')

    expect(response.sources.length).toBeGreaterThanOrEqual(3)
    expect(response.sources.every((source) => source.relevanceScore !== null)).toBe(
      true,
    )
  })
})

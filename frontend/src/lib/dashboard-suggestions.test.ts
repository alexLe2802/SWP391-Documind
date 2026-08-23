import { describe, expect, it } from 'vitest'
import type { LibraryDocument } from '../types/document'
import { buildDashboardSuggestions } from './dashboard-suggestions'

function document(title: string, indexStatus: LibraryDocument['indexStatus'] = 'READY') {
  return { title, indexStatus } as LibraryDocument
}

describe('buildDashboardSuggestions', () => {
  it('builds suggestions from the user ready documents', () => {
    const suggestions = buildDashboardSuggestions(
      [document('Machine Learning Notes'), document('Database Design')],
      'en',
    )

    expect(suggestions).toHaveLength(4)
    expect(suggestions[0]).toContain('Machine Learning Notes')
    expect(suggestions[1]).toContain('Database Design')
    expect(suggestions.every((suggestion) =>
      suggestion.includes('Machine Learning Notes') || suggestion.includes('Database Design'),
    )).toBe(true)
  })

  it('ignores documents that are not AI ready', () => {
    const suggestions = buildDashboardSuggestions(
      [document('Ready document'), document('Processing document', 'PROCESSING')],
      'vi',
    )

    expect(suggestions.every((suggestion) => suggestion.includes('Ready document'))).toBe(true)
    expect(suggestions.join(' ')).not.toContain('Processing document')
  })

  it('returns no suggestions when there are no AI-ready documents', () => {
    expect(buildDashboardSuggestions([document('Still processing', 'PENDING')], 'en')).toEqual([])
  })
})

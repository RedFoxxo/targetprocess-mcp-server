import { describe, expect, it, vi } from 'vitest'
import { handleSetBusinessValue } from '../src/handlers/set_business_value.js'
import type { TpClient } from '../src/tp.js'

describe('handleSetBusinessValue', () => {
  it('sets the requested priority without inspecting sibling stories', async () => {
    const mockTp = {
      setBusinessValue: vi.fn().mockResolvedValue({ Id: 36194, Priority: { Id: 1, Name: 'Must Have' } }),
      getUserStory: vi.fn(),
      getUserStoriesInFeatureWithPriority: vi.fn(),
    } as unknown as TpClient

    const result = await handleSetBusinessValue(mockTp, {
      id: '36194', entityType: 'UserStories', priorityId: '1',
    })

    expect(mockTp.setBusinessValue).toHaveBeenCalledWith({
      id: '36194', entityType: 'UserStories', priorityId: '1',
    })
    expect((mockTp as any).getUserStory).not.toHaveBeenCalled()
    expect((mockTp as any).getUserStoriesInFeatureWithPriority).not.toHaveBeenCalled()
    expect(JSON.parse(result.content[0].text).Priority.Name).toBe('Must Have')
  })

  it('returns mutation failures as MCP errors', async () => {
    const mockTp = {
      setBusinessValue: vi.fn().mockResolvedValue(new Error('Rejected')),
    } as unknown as TpClient

    const result = await handleSetBusinessValue(mockTp, {
      id: '36194', entityType: 'UserStories', priorityId: '1',
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Rejected')
  })
})

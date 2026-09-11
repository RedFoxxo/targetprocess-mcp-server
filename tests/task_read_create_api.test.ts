import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleGetTask, handleGetUserStoryTasks } from '../src/handlers/get_task.js'
import type { TpClient } from '../src/tp.js'

async function loadClient() {
  vi.resetModules()
  vi.stubEnv('TP_TOKEN', 'test-token')
  vi.stubEnv('TP_BASE_URL', 'https://tp.example.com')
  const { TpClient } = await import('../src/tp.js')
  return new TpClient()
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createTask API', () => {
  it('derives the project from the parent user story', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ Id: 36194, Project: { Id: 26080 } }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ Id: 40001 }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    const result = await tp.createTask({ title: 'Implement UI', userStoryId: '36194', description: '<p>Work</p>' })

    expect(result).toEqual({ ok: true, data: { Id: 40001 } })
    const options = fetchMock.mock.calls[1][1] as RequestInit
    expect(JSON.parse(String(options.body))).toEqual({
      Name: 'Implement UI',
      Project: { Id: 26080 },
      UserStory: { Id: '36194' },
      Description: '<p>Work</p>',
    })
  })

  it('does not POST when the parent project cannot be resolved', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ Id: 36194, Project: null }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    const result = await tp.createTask({ title: 'Implement UI', userStoryId: '36194' })

    expect(result).toMatchObject({ ok: false, status: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves parent-story lookup failure details', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false, status: 403, text: async () => 'Project access denied',
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    const result = await tp.createTask({ title: 'Implement UI', userStoryId: '36194' })

    expect(result).toMatchObject({ ok: false, status: 0 })
    expect(result.ok || result.body).toContain('status: 403; body: Project access denied')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves a Targetprocess validation response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ Project: { Id: 26080 } }) })
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'Invalid task payload' })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    const result = await tp.createTask({ title: 'Implement UI', userStoryId: '36194' })

    expect(result).toEqual({ ok: false, status: 400, body: 'Invalid task payload' })
  })
})

describe('Task reads', () => {
  it('returns one task by ID', async () => {
    const mockTp = { getTask: vi.fn().mockResolvedValue({ Id: 40001, Name: 'Implement UI' }) } as unknown as TpClient
    const result = await handleGetTask(mockTp, '40001')
    expect(JSON.parse(result.content[0].text)).toMatchObject({ Id: 40001 })
  })

  it('lists tasks under a user story', async () => {
    const mockTp = {
      getUserStoryTasks: vi.fn().mockResolvedValue([{ Id: 40001, Name: 'Implement UI' }]),
    } as unknown as TpClient
    const result = await handleGetUserStoryTasks(mockTp, '36194')
    expect(JSON.parse(result.content[0].text)).toEqual([{ Id: 40001, Name: 'Implement UI' }])
  })

  it('retrieves every page when listing tasks under a user story', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ Next: '/next', Items: [{ Id: 40001 }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ Next: '', Items: [{ Id: 40002 }] }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    const tasks = await tp.getUserStoryTasks('36194')

    expect(tasks).toEqual([{ Id: 40001 }, { Id: 40002 }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(decodeURIComponent(fetchMock.mock.calls[0][0])).toContain('skip=0')
    expect(decodeURIComponent(fetchMock.mock.calls[1][0])).toContain('skip=100')
  })

  it('preserves a task-list page failure', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false, status: 403, text: async () => 'Task access denied',
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    const result = await tp.getUserStoryTasks('36194')

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toContain('status: 403; body: Task access denied')
  })
})

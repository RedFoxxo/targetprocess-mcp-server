import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleGetTaskWorkflows } from '../src/handlers/get_task_workflows.js'
import type { TpClient } from '../src/tp.js'

const TOKEN = 'test-token'
const BASE_URL = 'https://tp.example.com'

async function loadClient() {
  vi.resetModules()
  vi.stubEnv('TP_TOKEN', TOKEN)
  vi.stubEnv('TP_BASE_URL', BASE_URL)
  const { TpClient } = await import('../src/tp.js')
  return new TpClient()
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function state(Id: number, Name: string, workflowId: number, parent: { Id: number, Name: string } | null = null) {
  return {
    Id,
    Name,
    NumericPriority: Id,
    IsInitial: false,
    IsFinal: false,
    Workflow: { Id: workflowId, Name: 'Task Workflow', ParentWorkflow: parent },
  } as any
}

describe('task workflow API requests', () => {
  it('reads the task process through its project', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Id: 36400 }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    await tp.getTaskProcess('36400')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/Tasks/36400/')
    expect(decodeURIComponent(url)).toContain('include=[Id,Name,Project[Id,Name,Process[Id,Name]]]')
  })

  // The EntityState.Process and EntityState.EntityType fields are deprecated
  // in the TP API, so the filter has to go through Workflow.
  it('filters task states through the workflow, not the deprecated fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Items: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    await tp.getEntityStates('89', 'Task')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/EntityStates/')
    const decoded = decodeURIComponent(url)
    expect(decoded).toContain("Workflow.Process.Id eq 89")
    expect(decoded).toContain("Workflow.EntityType.Name eq 'Task'")
  })
})

describe('handleGetTaskWorkflows', () => {
  const task = {
    Id: 36400,
    Name: 'Build ODA from selected offers',
    Project: { Id: 26080, Name: 'SBP', Process: { Id: 89, Name: 'Scrum' } },
  } as any

  it('resolves the process from the task and lists its states', async () => {
    const mockTp = {
      getTaskProcess: vi.fn().mockResolvedValue(task),
      getEntityStates: vi.fn().mockResolvedValue({
        Items: [state(740, 'Open', 12), state(742, 'Coded', 12)],
      }),
    } as unknown as TpClient

    const result = await handleGetTaskWorkflows(mockTp, '36400')

    expect(mockTp.getEntityStates).toHaveBeenCalledWith('89', 'Task')
    const payload = JSON.parse(result.content[0].text)
    expect(payload.process).toEqual({ id: 89, name: 'Scrum' })
    expect(payload.project).toEqual({ id: 26080, name: 'SBP' })
    // Reported by all three workflow tools so their payloads stay uniform.
    expect(payload.entityType).toBe('Task')
    expect(payload.states).toEqual([
      { entityStateId: 740, name: 'Open', numericPriority: 740, isInitial: false, isFinal: false, workflowId: 12, workflowName: 'Task Workflow', isTeamWorkflow: false },
      { entityStateId: 742, name: 'Coded', numericPriority: 742, isInitial: false, isFinal: false, workflowId: 12, workflowName: 'Task Workflow', isTeamWorkflow: false },
    ])
  })

  it('flags states that belong to a team sub-workflow', async () => {
    const mockTp = {
      getTaskProcess: vi.fn().mockResolvedValue(task),
      getEntityStates: vi.fn().mockResolvedValue({
        Items: [state(742, 'Coded', 12), state(801, 'Coded', 33, { Id: 12, Name: 'Task Workflow' })],
      }),
    } as unknown as TpClient

    const result = await handleGetTaskWorkflows(mockTp, '36400')

    const payload = JSON.parse(result.content[0].text)
    expect(payload.states.map((s: any) => s.isTeamWorkflow)).toEqual([false, true])
  })

  it('reports a task that could not be read', async () => {
    const mockTp = {
      getTaskProcess: vi.fn().mockResolvedValue(new Error('boom')),
      getEntityStates: vi.fn(),
    } as unknown as TpClient

    const result = await handleGetTaskWorkflows(mockTp, '36400')

    expect(mockTp.getEntityStates).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Failed to read task id: 36400')
  })

  it('reports a project with no process rather than querying states', async () => {
    const mockTp = {
      getTaskProcess: vi.fn().mockResolvedValue({ Id: 36400, Project: { Id: 26080, Name: 'SBP' } }),
      getEntityStates: vi.fn(),
    } as unknown as TpClient

    const result = await handleGetTaskWorkflows(mockTp, '36400')

    expect(mockTp.getEntityStates).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('has no project process')
  })

  it('reports an empty state list instead of returning an empty payload', async () => {
    const mockTp = {
      getTaskProcess: vi.fn().mockResolvedValue(task),
      getEntityStates: vi.fn().mockResolvedValue({ Items: [] }),
    } as unknown as TpClient

    const result = await handleGetTaskWorkflows(mockTp, '36400')

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('No Task states found for process id: 89')
  })
})

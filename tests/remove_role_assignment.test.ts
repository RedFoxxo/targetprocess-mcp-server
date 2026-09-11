import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleRemoveRoleAssignment } from '../src/handlers/remove_role_assignment.js'
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

describe('role assignment API requests', () => {
  it('queries an exact card, user, and role combination', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Items: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    await tp.getRoleAssignments('100', '200', '300')

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/Assignments/')
    expect(decodeURIComponent(url)).toContain('where=Assignable.Id eq 100 and GeneralUser.Id eq 200 and Role.Id eq 300')
    expect(decodeURIComponent(url)).toContain('take=2')
    expect(options.method).toBe('GET')
  })

  it('deletes an assignment by its exact assignment ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    const result = await tp.deleteRoleAssignment('400')

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/Assignments/400/')
    expect(options.method).toBe('DELETE')
    expect(result).toEqual({ ok: true, data: null })
  })
})

describe('handleRemoveRoleAssignment', () => {
  function assignment(Id: number) {
    return { Id } as any
  }

  it('deletes the only exact match', async () => {
    const mockTp = {
      getRoleAssignments: vi.fn().mockResolvedValue({ Items: [assignment(400)], Next: '' }),
      deleteRoleAssignment: vi.fn().mockResolvedValue({ ok: true, data: null }),
    } as unknown as TpClient

    const result = await handleRemoveRoleAssignment(mockTp, {
      cardId: '100', userId: '200', roleId: '300',
    })

    expect(mockTp.deleteRoleAssignment).toHaveBeenCalledWith('400')
    expect(JSON.parse(result.content[0].text)).toEqual({
      removed: true, assignmentId: 400, cardId: 100, userId: 200, roleId: 300,
    })
  })

  it('does not delete when no assignment matches', async () => {
    const mockTp = {
      getRoleAssignments: vi.fn().mockResolvedValue({ Items: [], Next: '' }),
      deleteRoleAssignment: vi.fn(),
    } as unknown as TpClient

    const result = await handleRemoveRoleAssignment(mockTp, {
      cardId: '100', userId: '200', roleId: '300',
    })

    expect(mockTp.deleteRoleAssignment).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('No matching role assignment')
  })

  it('does not delete when multiple assignments match', async () => {
    const mockTp = {
      getRoleAssignments: vi.fn().mockResolvedValue({ Items: [assignment(400), assignment(401)], Next: '' }),
      deleteRoleAssignment: vi.fn(),
    } as unknown as TpClient

    const result = await handleRemoveRoleAssignment(mockTp, {
      cardId: '100', userId: '200', roleId: '300',
    })

    expect(mockTp.deleteRoleAssignment).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Matching assignment IDs: 400, 401')
  })

  it('does not delete when another page of matches exists', async () => {
    const mockTp = {
      getRoleAssignments: vi.fn().mockResolvedValue({ Items: [assignment(400)], Next: '/next-page' }),
      deleteRoleAssignment: vi.fn(),
    } as unknown as TpClient

    const result = await handleRemoveRoleAssignment(mockTp, {
      cardId: '100', userId: '200', roleId: '300',
    })

    expect(mockTp.deleteRoleAssignment).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('ambiguous role assignment')
  })

  it('surfaces delete failures', async () => {
    const mockTp = {
      getRoleAssignments: vi.fn().mockResolvedValue({ Items: [assignment(400)], Next: '' }),
      deleteRoleAssignment: vi.fn().mockResolvedValue({ ok: false, status: 404, body: 'missing' }),
    } as unknown as TpClient

    const result = await handleRemoveRoleAssignment(mockTp, {
      cardId: '100', userId: '200', roleId: '300',
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('HTTP status: 404')
  })
})

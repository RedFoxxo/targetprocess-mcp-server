import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleUpdateTask } from '../src/handlers/update_task.js'
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

function stubSuccessfulUpdate() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ Id: 36195, Description: '<p>Updated</p>' }),
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => { })
  return fetchMock
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('updateTask description', () => {
  it('posts the supplied description to the Tasks collection', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateTask({ id: '36195', description: '<p>Updated</p>' })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/Tasks/')
    expect(options.method).toBe('POST')
    expect(JSON.parse(String(options.body))).toEqual({
      Id: '36195',
      Description: '<p>Updated</p>',
    })
  })

  it('returns the updated task from the handler', async () => {
    const mockTp = {
      updateTask: vi.fn().mockResolvedValue({ Id: 36195, Description: '<p>Updated</p>' }),
    } as unknown as TpClient

    const result = await handleUpdateTask(mockTp, {
      id: '36195',
      description: '<p>Updated</p>',
    })

    expect(JSON.parse(result.content[0].text)).toMatchObject({ Id: 36195 })
  })
})

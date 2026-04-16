import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { request } from './http'

describe('http request', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns envelope data when server uses the wrapped contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            message: 'ok',
            data: { id: 'plugin-a' },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      ),
    )

    await expect(request<{ id: string }>('/plugins/plugin-a', { skipAuth: true }))
      .resolves
      .toEqual({ id: 'plugin-a' })
  })

  it('returns raw json when server responds without an envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { id: 'plugin-a', name: 'Plugin A' },
            { id: 'plugin-b', name: 'Plugin B' },
          ]),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      ),
    )

    await expect(
      request<Array<{ id: string; name: string }>>('/plugins', {
        skipAuth: true,
      }),
    ).resolves.toEqual([
      { id: 'plugin-a', name: 'Plugin A' },
      { id: 'plugin-b', name: 'Plugin B' },
    ])
  })

  it('keeps raw nest error bodies readable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'Invalid credentials',
            error: 'Unauthorized',
            statusCode: 401,
          }),
          {
            status: 401,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      ),
    )

    await expect(
      request('/auth/login', {
        method: 'POST',
        body: {
          username: 'owner',
          password: 'bad-password',
        },
        skipAuth: true,
        skipRefreshRetry: true,
        skipUnauthorizedRedirect: true,
      }),
    ).rejects.toMatchObject({
      type: 'auth',
      status: 401,
      code: 'HTTP_ERROR',
      message: 'Invalid credentials',
    })
  })
})

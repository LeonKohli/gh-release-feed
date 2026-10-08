import { createError } from 'h3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { handleGithubError } from '../server/utils/github'

beforeAll(() => vi.stubGlobal('createError', createError))
afterAll(() => vi.unstubAllGlobals())

describe('GitHub error responses', () => {
  it.each([
    { response: { status: 200, headers: {}, data: { errors: [{ type: 'RATE_LIMITED' }] } } },
    { data: { errors: [{ type: 'RATE_LIMITED' }] } },
  ])('surfaces SDK GraphQL quota errors as HTTP429', (fields) => {
    const error = Object.assign(new Error('GitHub query failed'), fields)

    expect(() => handleGithubError(error)).toThrowError(
      expect.objectContaining({ statusCode: 429 }),
    )
  })

  it('preserves Retry-After for an HTTP429 response', () => {
    const error = Object.assign(new Error('Too many requests'), {
      status: 429,
      response: { headers: { 'retry-after': '120' } },
    })

    expect(() => handleGithubError(error)).toThrowError(
      expect.objectContaining({
        statusCode: 429,
        data: { resetAt: null, retryAfter: 120 },
      }),
    )
  })

  it('keeps a regular GitHub access denial as HTTP403', () => {
    const error = Object.assign(new Error('Resource not accessible by integration'), {
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': '4999' } },
    })

    expect(() => handleGithubError(error)).toThrowError(
      expect.objectContaining({ statusCode: 403 }),
    )
  })
})

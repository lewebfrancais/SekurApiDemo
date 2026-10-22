import { describe, expect, it } from 'vitest'
import { buildRequest, exampleFor, isMutation, listOperations } from './openapi.js'

const spec = {
  paths: {
    '/external/v1/customers': {
      post: {
        summary: 'Crée',
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Customer' } },
          },
        },
        responses: { 201: {}, 403: {} },
      },
      get: {
        summary: 'Liste',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'all'] } },
          { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } },
        ],
        responses: { 200: {} },
      },
    },
    '/external/v1/customers/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      delete: { summary: 'Supprime', responses: { 204: {} } },
    },
  },
  components: {
    schemas: {
      Customer: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'Entrepôts Martin' },
          type: { type: 'string', enum: ['company', 'individual'] },
          phones: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

describe('openapi', () => {
  it('liste toutes les opérations triées, avec paramètres chemin et requête seulement', () => {
    const ops = listOperations(spec)
    expect(ops.map((o) => o.id)).toEqual([
      'GET /external/v1/customers',
      'POST /external/v1/customers',
      'DELETE /external/v1/customers/{id}',
    ])
    const get = ops[0]
    expect(get.parameters.map((p) => p.name)).toEqual(['page', 'status'])
    expect(get.parameters[1].enum).toEqual(['active', 'all'])
    expect(ops[2].parameters).toEqual([expect.objectContaining({ name: 'id', required: true })])
  })

  it("génère un corps d'exemple minimal depuis le schéma (obligatoires, exemples)", () => {
    const [, post] = listOperations(spec)
    expect(post.hasBody).toBe(true)
    expect(post.bodyExample).toEqual({ name: 'Entrepôts Martin' })
    expect(exampleFor(spec, { type: 'array' })).toEqual([])
  })

  it('remplit le chemin, encode, et omet les paramètres vides', () => {
    const [get, , del] = listOperations(spec)
    expect(buildRequest(del, { id: 42 })).toEqual({ path: '/customers/42', query: {} })
    expect(buildRequest(get, { page: 2, status: '' })).toEqual({
      path: '/customers',
      query: { page: 2 },
    })
  })

  it('distingue lecture et écriture', () => {
    const [get, post, del] = listOperations(spec)
    expect([isMutation(get), isMutation(post), isMutation(del)]).toEqual([false, true, true])
  })
})

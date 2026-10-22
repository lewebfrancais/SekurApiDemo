// Lit la spec OpenAPI : opérations, paramètres et corps d'exemple (alimente l'Explorateur).

const METHODS = ['get', 'post', 'put', 'patch', 'delete']

function resolve(spec, node) {
  let current = node
  for (let i = 0; i < 20 && current; i += 1) {
    if (current.$ref) current = spec.components?.schemas?.[current.$ref.split('/').pop()]
    else if (current.oneOf?.length) current = current.oneOf[0]
    else if (current.allOf?.length === 1) current = current.allOf[0]
    else break
  }
  return current ?? {}
}

export function exampleFor(spec, node, depth = 0) {
  const schema = resolve(spec, node)
  if (schema.example !== undefined) return schema.example
  if (depth > 4) return null
  if (schema.enum?.length) return schema.enum[0]
  if (schema.type === 'object' || schema.properties) {
    const out = {}
    const required = new Set(schema.required ?? [])
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      // Corps d'exemple minimal : champs obligatoires, plus ceux qui ont un exemple explicite.
      const resolved = resolve(spec, child)
      if (required.has(key) || resolved.example !== undefined) {
        out[key] = exampleFor(spec, child, depth + 1)
      }
    }
    return out
  }
  if (schema.type === 'array') return []
  if (schema.type === 'integer' || schema.type === 'number') return 1
  if (schema.type === 'boolean') return false
  if (schema.type === 'string') return ''
  return null
}

function paramList(spec, pathItem, operation) {
  const raw = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
  return raw
    .map((param) =>
      param.$ref ? spec.components?.parameters?.[param.$ref.split('/').pop()] : param,
    )
    .filter(Boolean)
    .map((param) => {
      const schema = resolve(spec, param.schema)
      return {
        name: param.name,
        in: param.in,
        required: Boolean(param.required),
        type: schema.type ?? 'string',
        enum: schema.enum ?? null,
        description: param.description ?? '',
        example: param.example ?? schema.example ?? null,
      }
    })
}

export function listOperations(spec) {
  const operations = []
  for (const [path, pathItem] of Object.entries(spec?.paths ?? {})) {
    for (const method of METHODS) {
      const operation = pathItem[method]
      if (!operation) continue
      const bodySchema = operation.requestBody?.content?.['application/json']?.schema
      const parameters = paramList(spec, pathItem, operation)
      operations.push({
        id: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? '',
        description: operation.description ?? '',
        // Les en-têtes (Idempotency-Key) sont gérés par le client : pas de champ de formulaire.
        parameters: parameters.filter((p) => p.in === 'path' || p.in === 'query'),
        hasBody: Boolean(bodySchema),
        bodyExample: bodySchema ? exampleFor(spec, bodySchema) : null,
        statuses: Object.keys(operation.responses ?? {}),
      })
    }
  }
  const order = (op) => METHODS.indexOf(op.method.toLowerCase())
  return operations.sort((a, b) => a.path.localeCompare(b.path) || order(a) - order(b))
}

export function buildRequest(operation, values, basePath = '/external/v1') {
  let path = operation.path.startsWith(basePath)
    ? operation.path.slice(basePath.length)
    : operation.path
  const query = {}
  for (const param of operation.parameters) {
    const value = values[param.name]
    if (param.in === 'path') path = path.replace(`{${param.name}}`, encodeURIComponent(value ?? ''))
    else if (value !== undefined && value !== null && value !== '') query[param.name] = value
  }
  return { path, query }
}

export const isMutation = (operation) => operation.method !== 'GET'

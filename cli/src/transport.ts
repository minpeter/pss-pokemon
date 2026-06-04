import ky, { HTTPError, type KyInstance } from "ky"
import { z } from "zod"

const ErrorResponseSchema = z.object({
  detail: z.string().optional(),
})

export interface JsonTransport {
  getBytes(path: string): Promise<Uint8Array>
  getJson(path: string): Promise<unknown>
  postJson(path: string, payload: unknown): Promise<unknown>
}

export class BackendHttpError extends Error {
  readonly name = "BackendHttpError"

  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly statusText: string,
    readonly detail: string | undefined,
    options?: ErrorOptions,
  ) {
    super(
      `${method} ${path} failed with ${status} ${statusText}${detail === undefined ? "" : `: ${detail}`}`,
      options,
    )
  }
}

export class KyJsonTransport implements JsonTransport {
  readonly #client: KyInstance

  constructor(baseUrl: string) {
    this.#client = ky.create({
      prefixUrl: baseUrl,
      timeout: 5000,
      retry: 0,
    })
  }

  async getJson(path: string): Promise<unknown> {
    const normalizedPath = normalizePath(path)
    try {
      return await this.#client.get(normalizedPath).json<unknown>()
    } catch (error) {
      if (error instanceof HTTPError) {
        throw await createBackendHttpError({ error, method: "GET", path: normalizedPath })
      }
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`GET ${normalizedPath} failed with a non-Error rejection`)
    }
  }

  async getBytes(path: string): Promise<Uint8Array> {
    const normalizedPath = normalizePath(path)
    try {
      return new Uint8Array(await this.#client.get(normalizedPath).arrayBuffer())
    } catch (error) {
      if (error instanceof HTTPError) {
        throw await createBackendHttpError({ error, method: "GET", path: normalizedPath })
      }
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`GET ${normalizedPath} failed with a non-Error rejection`)
    }
  }

  async postJson(path: string, payload: unknown): Promise<unknown> {
    const normalizedPath = normalizePath(path)
    try {
      return await this.#client.post(normalizedPath, { json: payload }).json<unknown>()
    } catch (error) {
      if (error instanceof HTTPError) {
        throw await createBackendHttpError({ error, method: "POST", path: normalizedPath })
      }
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`POST ${normalizedPath} failed with a non-Error rejection`)
    }
  }
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "")
}

async function createBackendHttpError({
  error,
  method,
  path,
}: {
  readonly error: HTTPError
  readonly method: string
  readonly path: string
}): Promise<BackendHttpError> {
  return new BackendHttpError(
    method,
    path,
    error.response.status,
    error.response.statusText,
    await readErrorDetail(error.response),
    { cause: error },
  )
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  let bodyText: string
  try {
    bodyText = await response.clone().text()
  } catch (error) {
    if (error instanceof Error) {
      return undefined
    }
    throw error
  }
  return parseErrorDetail(bodyText)
}

function parseErrorDetail(bodyText: string): string | undefined {
  const trimmed = bodyText.trim()
  if (trimmed.length === 0) {
    return undefined
  }

  try {
    const parsedBody: unknown = JSON.parse(trimmed)
    const result = ErrorResponseSchema.safeParse(parsedBody)
    return result.success ? result.data.detail : trimmed
  } catch (error) {
    if (error instanceof SyntaxError) {
      return trimmed
    }
    throw error
  }
}

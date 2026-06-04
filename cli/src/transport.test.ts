import { afterEach, describe, expect, test } from "bun:test"
import { KyJsonTransport } from "./transport"

const servers: Bun.Server<undefined>[] = []

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.stop(true)
  }
})

describe("KyJsonTransport", () => {
  test("reads binary backend responses", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(Buffer.from("grid-png"), { headers: { "content-type": "image/png" } }),
    })
    servers.push(server)
    const transport = new KyJsonTransport(`http://127.0.0.1:${server.port}`)

    const bytes = await transport.getBytes("screenshot/grid?scale=4")

    expect(Buffer.from(bytes).toString("utf8")).toBe("grid-png")
  })

  test("includes backend error detail in failed action messages", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        Response.json(
          { detail: "another controller is active" },
          { status: 409, statusText: "Conflict" },
        ),
    })
    servers.push(server)
    const transport = new KyJsonTransport(`http://127.0.0.1:${server.port}`)

    try {
      await transport.postJson("action", {})
      throw new Error("expected backend conflict")
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error
      }
      expect(error.message).toContain(
        "POST action failed with 409 Conflict: another controller is active",
      )
    }
  })
})

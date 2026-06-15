import {
  type ActionRequest,
  type ActionResponse,
  ActionResponseSchema,
  type CommandStatusResponse,
  CommandStatusResponseSchema,
  type ControlLeaseResponse,
  ControlLeaseResponseSchema,
  type DashboardEventRequest,
  type EventWriteResponse,
  EventWriteResponseSchema,
  type GameState,
  GameStateSchema,
  type HealthResponse,
  HealthResponseSchema,
  type ResetMode,
  type Screenshot,
  ScreenshotSchema,
} from "./schemas"
import type { JsonTransport } from "./transport"

const DEFAULT_GRID_SCALE = 4

export class PokemonApiClient {
  readonly #transport: JsonTransport

  constructor(transport: JsonTransport) {
    this.#transport = transport
  }

  async health(): Promise<HealthResponse> {
    return HealthResponseSchema.parse(await this.#transport.getJson("health"))
  }

  async heartbeat(controllerId: string): Promise<ControlLeaseResponse> {
    return ControlLeaseResponseSchema.parse(
      await this.#transport.postJson("control/heartbeat", { controllerId }),
    )
  }

  async releaseController(controllerId: string): Promise<ControlLeaseResponse> {
    return ControlLeaseResponseSchema.parse(
      await this.#transport.postJson("control/release", { controllerId }),
    )
  }

  async sendAction(action: ActionRequest): Promise<ActionResponse> {
    return ActionResponseSchema.parse(await this.#transport.postJson("action", action))
  }

  async postEvent(event: DashboardEventRequest): Promise<EventWriteResponse> {
    return EventWriteResponseSchema.parse(await this.#transport.postJson("event", event))
  }

  async state(): Promise<GameState> {
    return GameStateSchema.parse(await this.#transport.getJson("state"))
  }

  async screenshot(): Promise<Screenshot> {
    return ScreenshotSchema.parse(await this.#transport.getJson("screenshot?format=base64"))
  }

  async gridScreenshot(scale = DEFAULT_GRID_SCALE): Promise<Screenshot> {
    const png = await this.#transport.getBytes(`screenshot/grid?scale=${scale}`)
    return ScreenshotSchema.parse({ pngBase64: Buffer.from(png).toString("base64") })
  }

  async save(name: string, overwrite: boolean): Promise<CommandStatusResponse> {
    return CommandStatusResponseSchema.parse(
      await this.#transport.postJson("save", { name, overwrite }),
    )
  }

  async load(name: string): Promise<CommandStatusResponse> {
    return CommandStatusResponseSchema.parse(await this.#transport.postJson("load", { name }))
  }

  async reset(mode: ResetMode): Promise<CommandStatusResponse> {
    return CommandStatusResponseSchema.parse(await this.#transport.postJson("reset", { mode }))
  }
}

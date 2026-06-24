import { describe, expect, test } from "bun:test"
import { observationFixture } from "./agent-test-fixtures"
import {
  blockedEdgeAdvice,
  createMinimalRedBlueWorldModel,
  recordBlockedEdge,
  WorldModelSchema,
} from "./world-model"

describe("Red/Blue world model", () => {
  test("validates minimal world model schema and provenance fields", () => {
    const model = WorldModelSchema.parse(createMinimalRedBlueWorldModel())

    expect(model).toEqual(
      expect.objectContaining({
        modelId: "red-blue-minimal-v1",
        type: "red_blue_world_model",
      }),
    )
    expect(model.provenance.sourceKind).toBe("hand_authored")
    expect(model.transitions.at(0)?.fromMapName).toBe("Pallet Town")
    expect(model.routeGoals.at(0)?.goalId).toBe("redblue.pallet_to_route1")
  })

  test("records blocked edge as advisory context while requiring live observation", () => {
    const model = recordBlockedEdge(createMinimalRedBlueWorldModel(), {
      direction: "up",
      from: { x: 5, y: 6 },
      mapId: 0,
      mapName: "Pallet Town",
    })

    expect(
      blockedEdgeAdvice({
        direction: "up",
        model,
        state: observationFixture.state,
      }),
    ).toBe("blocked edge advisory: Pallet Town x=5, y=6 up")

    expect(
      blockedEdgeAdvice({
        direction: "up",
        model,
        state: {
          ...observationFixture.state,
          player: { ...observationFixture.state.player, tile: null },
        },
      }),
    ).toBeNull()
    console.log("blocked edge advisory live observation")
  })

  test("does not treat world knowledge as live movement permission", () => {
    const model = recordBlockedEdge(createMinimalRedBlueWorldModel(), {
      direction: "up",
      from: { x: 5, y: 6 },
      mapId: 0,
      mapName: "Pallet Town",
    })

    expect(
      blockedEdgeAdvice({
        direction: "left",
        model,
        state: observationFixture.state,
      }),
    ).toBeNull()
  })
})

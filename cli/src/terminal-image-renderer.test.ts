import { describe, expect, test } from "bun:test"
import { createObservationImageRenderer } from "./terminal-image-renderer"

const twoByTwoColorPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4AQXBAQEAAACCIPo/2kBETQoHQ9cG+/+3sWwAAAAASUVORK5CYII=",
  "base64",
)

describe("createObservationImageRenderer", () => {
  test("falls back to crisp truecolor when native rendering only returns ANSI half-blocks", async () => {
    const nativeAnsiFallback = "\u001B[48;2;1;2;3m\u2584\u001B[39m\u001B[49m"
    const nativeRequests: boolean[] = []
    const renderer = createObservationImageRenderer((_payload, options) => {
      nativeRequests.push(options.preferNativeRender)
      return Promise.resolve(nativeAnsiFallback)
    })
    const originalTerm = process.env["TERM"]
    const originalNoColor = process.env["NO_COLOR"]
    process.env["TERM"] = "xterm-256color"
    delete process.env["NO_COLOR"]

    try {
      const rendered = await renderer.render(twoByTwoColorPng, {
        height: 1,
        preserveAspectRatio: true,
      })

      expect(nativeRequests).toEqual([true])
      expect(rendered).not.toBe(nativeAnsiFallback)
      expect(rendered).toContain("\u001B[48;2;255;0;0m")
      expect(rendered).toContain("\u001B[38;2;0;255;0m")
    } finally {
      restoreEnv("TERM", originalTerm)
      restoreEnv("NO_COLOR", originalNoColor)
    }
  })

  test("keeps native monochrome output when terminal color is unsupported", async () => {
    const nativeMonochromeOutput = "▄▄"
    const renderer = createObservationImageRenderer(() => Promise.resolve(nativeMonochromeOutput))
    const originalTerm = process.env["TERM"]
    const originalColorTerm = process.env["COLORTERM"]
    const originalForceColor = process.env["FORCE_COLOR"]
    process.env["TERM"] = "dumb"
    delete process.env["COLORTERM"]
    delete process.env["FORCE_COLOR"]

    try {
      const rendered = await renderer.render(twoByTwoColorPng, {
        height: 1,
        preserveAspectRatio: true,
      })

      expect(rendered).toBe(nativeMonochromeOutput)
    } finally {
      restoreEnv("TERM", originalTerm)
      restoreEnv("COLORTERM", originalColorTerm)
      restoreEnv("FORCE_COLOR", originalForceColor)
    }
  })

  test("keeps native terminal graphics protocol output when available", async () => {
    const nativeProtocolOutput = "\u001B]1337;File=inline=1:abc\u0007"
    const renderer = createObservationImageRenderer(() => Promise.resolve(nativeProtocolOutput))

    const rendered = await renderer.render(twoByTwoColorPng, {
      height: 1,
      preserveAspectRatio: true,
    })

    expect(rendered).toBe(nativeProtocolOutput)
  })
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

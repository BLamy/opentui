import { expect, test } from "bun:test"
import { decodeExampleHash, encodeExampleHash, exampleParentOrigin } from "./example-protocol"

test("embedded previews address the actual parent's origin", () => {
  expect(
    exampleParentOrigin("https://docs.example.com/guide", "https://blamy.github.io/opentui/workbench/example/"),
  ).toBe("https://docs.example.com")
  expect(exampleParentOrigin("", "https://blamy.github.io/opentui/workbench/example/")).toBe("https://blamy.github.io")
  expect(exampleParentOrigin("invalid", "http://localhost:4321/workbench/example/")).toBe("http://localhost:4321")
})

test("program links preserve Unicode terminal content", () => {
  const source = { code: 'console.log("┌ Hello 🌍 ┐")', language: "typescript" }
  expect(decodeExampleHash(encodeExampleHash(source))).toEqual(source)
})

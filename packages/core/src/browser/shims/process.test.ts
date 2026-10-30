import { expect, test } from "bun:test"
import process from "./process"

test("libraries can identify the browser without detecting a Node runtime", () => {
  expect(process.browser).toBe(true)
  expect(process.version).toBe("")
  expect(process.versions.node).toBeUndefined()
  expect(process.platform).toBe("browser")
})

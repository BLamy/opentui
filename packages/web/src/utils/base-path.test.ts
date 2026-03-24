import { afterEach, expect, test } from "bun:test"

import { getBasePath, getBaseUrl, stripBase, withBase } from "./base-path"

const originalBaseUrl = import.meta.env.BASE_URL

afterEach(() => {
  if (originalBaseUrl === undefined) {
    delete import.meta.env.BASE_URL
    return
  }

  import.meta.env.BASE_URL = originalBaseUrl
})

test("defaults to the site root when no base URL is configured", () => {
  delete import.meta.env.BASE_URL

  expect(getBaseUrl()).toBe("/")
  expect(getBasePath()).toBe("")
  expect(withBase("/docs/getting-started")).toBe("/docs/getting-started")
  expect(stripBase("/docs/getting-started")).toBe("/docs/getting-started")
})

test("prefixes internal paths when a GitHub Pages base URL is configured", () => {
  import.meta.env.BASE_URL = "/opentui/"

  expect(getBaseUrl()).toBe("/opentui/")
  expect(getBasePath()).toBe("/opentui")
  expect(withBase("/")).toBe("/opentui/")
  expect(withBase("/docs/getting-started")).toBe("/opentui/docs/getting-started")
  expect(withBase("workbench")).toBe("/opentui/workbench")
  expect(stripBase("/opentui/docs/getting-started")).toBe("/docs/getting-started")
  expect(stripBase("/opentui")).toBe("/")
})

test("leaves external and hash/query-only URLs unchanged", () => {
  import.meta.env.BASE_URL = "/opentui/"

  expect(withBase("https://example.com")).toBe("https://example.com")
  expect(withBase("//cdn.example.com/app.js")).toBe("//cdn.example.com/app.js")
  expect(withBase("#getting-started")).toBe("#getting-started")
  expect(withBase("?tab=core")).toBe("?tab=core")
})

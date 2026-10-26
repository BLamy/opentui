import { expect, test } from "bun:test"
import { rebaseHome, rebaseText } from "./rebase-site"

const roots = ["_astro", "docs", "favicon.svg", "opentui"]

test("prefixes root-relative URLs of the build's root entries", () => {
  const html = `<a href="/docs/x#y">x</a><img srcset="/_astro/a.png 1x, /_astro/b.png 2x"><link href="/favicon.svg">`
  expect(rebaseText(html, "/fork", roots)).toBe(
    `<a href="/fork/docs/x#y">x</a><img srcset="/fork/_astro/a.png 1x, /fork/_astro/b.png 2x"><link href="/fork/favicon.svg">`,
  )
  expect(rebaseText(`<meta http-equiv="refresh" content="0;url=/docs">`, "/fork", roots)).toBe(
    `<meta http-equiv="refresh" content="0;url=/fork/docs">`,
  )
  expect(rebaseText("fetch(`/opentui/opentui.wasm`);url(/_astro/f.ttf)", "/opentui", roots)).toBe(
    "fetch(`/opentui/opentui/opentui.wasm`);url(/opentui/_astro/f.ttf)",
  )
  expect(rebaseText(`data-x="{&quot;src&quot;:&quot;/docs/a.json&quot;}"`, "/fork", roots)).toBe(
    `data-x="{&quot;src&quot;:&quot;/fork/docs/a.json&quot;}"`,
  )
})

test("leaves other URLs alone", () => {
  const text = `<a href="https://opentui.com/docs">x</a><a href="//cdn/docs"></a><a href="/docsy"></a><a href="/api">`
  expect(rebaseText(text, "/fork", roots)).toBe(text)
})

test("prefixes links to the site root in pages", () => {
  expect(rebaseHome(`<a href="/">home</a><a href="/?theme=cobalt">x</a><a data-x="/">`, "/fork")).toBe(
    `<a href="/fork/">home</a><a href="/fork/?theme=cobalt">x</a><a data-x="/">`,
  )
})

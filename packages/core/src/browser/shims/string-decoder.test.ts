import { expect, test } from "bun:test"
import { StringDecoder as NodeDecoder } from "node:string_decoder"
import { StringDecoder } from "./string-decoder"

test("stdout decoding matches Node when Unicode characters cross every byte boundary", () => {
  const bytes = new TextEncoder().encode("\uFEFF┌ Hello 🌍 漢字 é ┐")
  for (let split = 0; split <= bytes.length; split++) {
    const actual = new StringDecoder("utf8")
    const expected = new NodeDecoder("utf8")
    expect(actual.write(bytes.subarray(0, split))).toBe(expected.write(bytes.subarray(0, split)))
    expect(actual.end(bytes.subarray(split))).toBe(expected.end(bytes.subarray(split)))
  }
})

test("flushes incomplete bytes and can decode another stream afterward", () => {
  const actual = new StringDecoder()
  const expected = new NodeDecoder()
  expect(actual.write(new Uint8Array([0xf0, 0x9f]))).toBe(expected.write(Buffer.from([0xf0, 0x9f])))
  expect(actual.end()).toBe(expected.end())
  expect(actual.end(new Uint8Array([65]))).toBe(expected.end(Buffer.from([65])))
})

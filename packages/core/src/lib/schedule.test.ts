import { afterEach, expect, test } from "bun:test"

import { scheduleNextMicrotask } from "./schedule.js"

const originalProcess = globalThis.process

afterEach(() => {
  globalThis.process = originalProcess
})

test("scheduleNextMicrotask prefers native process.nextTick when available", () => {
  let scheduledCallback: (() => void) | undefined
  const calls: string[] = []

  globalThis.process = {
    ...originalProcess,
    nextTick: (callback: () => void) => {
      calls.push("nextTick")
      scheduledCallback = callback
    },
  } as typeof process

  scheduleNextMicrotask(() => {
    calls.push("callback")
  })

  expect(calls).toEqual(["nextTick"])
  expect(scheduledCallback).toBeDefined()

  scheduledCallback?.()

  expect(calls).toEqual(["nextTick", "callback"])
})

test("scheduleNextMicrotask still schedules asynchronously when process.nextTick is missing", async () => {
  const calls: string[] = []

  globalThis.process = {
    ...originalProcess,
    nextTick: undefined,
  } as typeof process

  scheduleNextMicrotask(() => {
    calls.push("callback")
  })
  calls.push("after")

  await Promise.resolve()
  await Promise.resolve()

  expect(calls).toEqual(["after", "callback"])
})

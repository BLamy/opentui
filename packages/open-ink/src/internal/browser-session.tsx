import { EventEmitter } from "node:events"
import { PassThrough, Readable } from "node:stream"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BrowserRenderEvents, BrowserRenderer } from "@opentui/core/browser"
import type { BrowserRendererConfig, BrowserTerminalHost, KeyEvent, PasteEvent } from "@opentui/core/browser"
import { runtime } from "./runtime.js"
import { defaultScreenReaderEnabled } from "./options.js"
import { SessionContext } from "../context/session.js"
import { AppContext } from "../context/app.js"
import { StdinContext, type StdinContextValue } from "../context/stdin.js"
import { StdoutContext } from "../context/stdout.js"
import { StderrContext } from "../context/stderr.js"
import { FocusContext } from "../context/focus.js"
import { CursorContext, type CursorPosition } from "../context/cursor.js"
import { accessibilityContext } from "../context/accessibility.js"
import { backgroundContext } from "../context/background.js"
import { TextContext } from "../context/text.js"
import { ErrorBoundary } from "../components/error-boundary.js"

type CommitListener = () => void
type RootContainer = ReturnType<typeof runtime.createContainer>
type FocusEntry = {
  id: string
  autoFocus: boolean
  isActive: boolean
}

export interface RenderMetrics {
  renderTime: number
}

export interface CreateBrowserSessionOptions {
  host: BrowserTerminalHost
  autoFocus?: boolean
  useMouse?: boolean
  enableMouseMovement?: boolean
  backgroundColor?: string
  onRender?: (metrics: RenderMetrics) => void
  isScreenReaderEnabled?: boolean
  concurrent?: boolean
}

interface BrowserSessionOptions {
  renderer: BrowserRenderer
  stdin: NodeJS.ReadStream
  stdout: NodeJS.WriteStream
  stderr: NodeJS.WriteStream
  onRender?: (metrics: RenderMetrics) => void
  isScreenReaderEnabled: boolean
  concurrent: boolean
}

function createStreamLike(columns: number, rows: number): NodeJS.WriteStream {
  const stream = new PassThrough() as PassThrough & NodeJS.WriteStream & { columns: number; rows: number; isTTY: boolean }
  stream.columns = columns
  stream.rows = rows
  stream.isTTY = true
  return stream
}

function createReadStreamLike(): NodeJS.ReadStream {
  const stream = new Readable({ read() {} }) as NodeJS.ReadStream & {
    isTTY?: boolean
    setRawMode?: (value: boolean) => NodeJS.ReadStream
  }
  stream.isTTY = true
  stream.setRawMode = () => stream
  return stream
}

function nowMs(): number {
  return globalThis.performance?.now() ?? Date.now()
}

function getFocusableIds(entries: FocusEntry[]): string[] {
  return entries.filter((entry) => entry.isActive).map((entry) => entry.id)
}

function nextFocusableId(entries: FocusEntry[], currentId: string | undefined, direction: 1 | -1): string | undefined {
  const ids = getFocusableIds(entries)
  if (ids.length === 0) {
    return undefined
  }

  if (!currentId) {
    return direction === 1 ? ids[0] : ids[ids.length - 1]
  }

  const index = ids.indexOf(currentId)
  if (index === -1) {
    return ids[0]
  }

  const nextIndex = (index + direction + ids.length) % ids.length
  return ids[nextIndex]
}

export class OpenInkSession {
  public readonly renderer: BrowserRenderer
  public readonly stdin: NodeJS.ReadStream
  public readonly stdout: NodeJS.WriteStream
  public readonly stderr: NodeJS.WriteStream
  public readonly interactive = true
  public readonly debug = false
  public readonly exitOnCtrlC = true
  public readonly isScreenReaderEnabled: boolean
  public readonly concurrent: boolean
  public readonly manualFrames = false
  public readonly keyInput: EventEmitter
  public readonly stdinEventEmitter = new EventEmitter()

  private readonly container: RootContainer
  private readonly commitListeners = new Set<CommitListener>()
  private readonly pendingFlushResolvers = new Set<() => void>()
  private readonly onRender?: (metrics: RenderMetrics) => void

  private currentCursorPosition: CursorPosition | undefined
  private currentNode: React.ReactNode = null
  private appendStaticEntry?: (node: React.ReactNode) => void
  private clearStaticEntries?: () => void
  private lastRenderStartedAt = 0
  private destroyed = false
  private unmounting = false
  private rawModeRequests = 0
  private renderCount = 0
  private exitResolve!: (value: unknown) => void
  private exitReject!: (error: unknown) => void
  private waitUntilExitPromise: Promise<unknown>
  private lastRenderFlush: Promise<void> = Promise.resolve()

  constructor(options: BrowserSessionOptions) {
    this.renderer = options.renderer
    this.stdin = options.stdin
    this.stdout = options.stdout
    this.stderr = options.stderr
    this.keyInput = options.renderer.keyInput as unknown as EventEmitter
    this.onRender = options.onRender
    this.isScreenReaderEnabled = options.isScreenReaderEnabled
    this.concurrent = options.concurrent
    this.container = runtime.createContainer(options.renderer.root, {
      concurrent: options.concurrent,
      onCommit: this.handleCommit,
    })
    this.waitUntilExitPromise = new Promise((resolve, reject) => {
      this.exitResolve = resolve
      this.exitReject = reject
    })

    this.renderer.once(BrowserRenderEvents.DESTROY, () => {
      this.finalizeExit(undefined)
    })
  }

  public setStaticHandlers(
    appendStaticEntry?: (node: React.ReactNode) => void,
    clearStaticEntries?: () => void,
  ): void {
    this.appendStaticEntry = appendStaticEntry
    this.clearStaticEntries = clearStaticEntries
  }

  public addCommitListener(listener: CommitListener): () => void {
    this.commitListeners.add(listener)
    return () => {
      this.commitListeners.delete(listener)
    }
  }

  public setCursorPosition(position: CursorPosition | undefined): void {
    this.currentCursorPosition = position
  }

  public render = (node: React.ReactNode): void => {
    if (this.destroyed) {
      return
    }

    this.currentNode = node
    this.lastRenderStartedAt = nowMs()
    this.lastRenderFlush = this.createFlushPromise()
    const wrappedNode = React.createElement(RootShell, {
      key: `root-${this.renderCount++}`,
      session: this,
      children: node,
    })

    if (this.concurrent) {
      runtime.updateContainer(wrappedNode, this.container)
    } else {
      runtime.updateContainerSync(wrappedNode, this.container)
      runtime.flushSyncWork()
    }
  }

  public rerender = (node: React.ReactNode): void => {
    this.render(node)
  }

  public waitUntilRenderFlush = async (): Promise<void> => {
    await this.lastRenderFlush
  }

  public waitUntilExit = async (): Promise<unknown> => this.waitUntilExitPromise

  public writeStdout = (data: string): void => {
    if (!data) {
      return
    }

    this.appendStaticEntry?.(data)
  }

  public writeStderr = (data: string): void => {
    if (!data) {
      return
    }

    this.appendStaticEntry?.(data)
  }

  public appendStaticNode = (node: React.ReactNode): void => {
    this.appendStaticEntry?.(node)
  }

  public clear = (): void => {
    this.clearStaticEntries?.()
    if (this.stdout.isTTY) {
      this.stdout.write("\u001B[2J\u001B[H")
    }
  }

  public cleanup = (): void => {
    this.unmount()
  }

  public exit = (errorOrResult?: Error | unknown): void => {
    this.unmount(errorOrResult)
  }

  public unmount = (errorOrResult?: Error | unknown): void => {
    if (this.unmounting || this.destroyed) {
      return
    }

    this.unmounting = true
    runtime.unmountContainer(this.container)
    runtime.flushSyncWork()
    this.destroy()
    this.finalizeExit(errorOrResult)
  }

  public destroy(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    this.renderer.destroy()
  }

  public setRawMode = (value: boolean): void => {
    const setRawMode = (this.stdin as NodeJS.ReadStream & { setRawMode?: (value: boolean) => void }).setRawMode
    if (!setRawMode) {
      throw new Error("stdin does not support raw mode")
    }

    if (value) {
      this.rawModeRequests += 1
      if (this.rawModeRequests === 1) {
        setRawMode.call(this.stdin, true)
      }
      return
    }

    this.rawModeRequests = Math.max(0, this.rawModeRequests - 1)
    if (this.rawModeRequests === 0) {
      setRawMode.call(this.stdin, false)
    }
  }

  public setBracketedPasteMode = (_value: boolean): void => {}

  private createFlushPromise(): Promise<void> {
    return new Promise((resolve) => {
      this.pendingFlushResolvers.add(resolve)
    })
  }

  private resolveFlushes = async (): Promise<void> => {
    if (this.pendingFlushResolvers.size === 0) {
      return
    }

    await Promise.resolve()
    await Promise.resolve()

    const resolvers = [...this.pendingFlushResolvers]
    this.pendingFlushResolvers.clear()
    resolvers.forEach((resolve) => resolve())
  }

  private applyCursorPosition(): void {
    if (this.currentCursorPosition) {
      this.renderer.setCursorPosition(this.currentCursorPosition.x, this.currentCursorPosition.y, true)
      return
    }

    this.renderer.setCursorPosition(0, 0, false)
  }

  private handleCommit = (): void => {
    this.applyCursorPosition()

    const metrics: RenderMetrics = {
      renderTime: Math.max(nowMs() - this.lastRenderStartedAt, 0),
    }

    this.onRender?.(metrics)
    this.commitListeners.forEach((listener) => listener())
    queueMicrotask(() => {
      void this.resolveFlushes()
    })
  }

  private finalizeExit(errorOrResult?: Error | unknown): void {
    if (errorOrResult instanceof Error) {
      this.exitReject(errorOrResult)
      return
    }

    this.exitResolve(errorOrResult)
  }
}

function RootShell(props: { session: OpenInkSession; children: React.ReactNode }): React.ReactNode {
  const { session, children } = props
  const [staticEntries, setStaticEntries] = useState<React.ReactNode[]>([])
  const [focusState, setFocusState] = useState<{
    entries: FocusEntry[]
    activeId?: string
    enabled: boolean
  }>({
    entries: [],
    activeId: undefined,
    enabled: true,
  })
  const focusStateRef = useRef(focusState)
  focusStateRef.current = focusState

  const appendStaticEntry = useCallback((node: React.ReactNode) => {
    setStaticEntries((previous) => [
      ...previous,
      React.createElement(React.Fragment, { key: `static-${previous.length}` }, node),
    ])
  }, [])

  const clearStaticEntries = useCallback(() => {
    setStaticEntries([])
  }, [])

  useEffect(() => {
    session.setStaticHandlers(appendStaticEntry, clearStaticEntries)
    return () => {
      session.setStaticHandlers()
    }
  }, [appendStaticEntry, clearStaticEntries, session])

  const focusNext = useCallback(() => {
    setFocusState((previous) => ({
      ...previous,
      activeId: previous.enabled ? nextFocusableId(previous.entries, previous.activeId, 1) : undefined,
    }))
  }, [])

  const focusPrevious = useCallback(() => {
    setFocusState((previous) => ({
      ...previous,
      activeId: previous.enabled ? nextFocusableId(previous.entries, previous.activeId, -1) : undefined,
    }))
  }, [])

  useEffect(() => {
    const handleKeypress = (event: KeyEvent) => {
      if (event.name !== "tab" || event.defaultPrevented) {
        return
      }

      const currentState = focusStateRef.current
      if (!currentState.enabled || getFocusableIds(currentState.entries).length === 0) {
        return
      }

      runtime.flushSync(() => {
        if (event.shift) {
          focusPrevious()
        } else {
          focusNext()
        }
      })

      event.preventDefault()
      event.stopPropagation()
    }

    const handlePaste = (event: PasteEvent) => {
      session.stdinEventEmitter.emit("paste", new TextDecoder().decode(event.bytes))
    }

    const handlePress = (event: KeyEvent) => {
      if (event.eventType === "release") {
        return
      }

      if (session.exitOnCtrlC && event.ctrl && event.name === "c") {
        session.exit()
        event.preventDefault()
        event.stopPropagation()
      }

      handleKeypress(event)
      if (event.defaultPrevented) {
        return
      }

      session.stdinEventEmitter.emit("input", event)
    }

    session.keyInput.on("keypress", handlePress)
    session.keyInput.on("paste", handlePaste)

    return () => {
      session.keyInput.off("keypress", handlePress)
      session.keyInput.off("paste", handlePaste)
    }
  }, [focusNext, focusPrevious, session])

  const focusContextValue = useMemo(() => {
    return {
      activeId: focusState.activeId,
      add(id: string, options: { autoFocus: boolean }) {
        setFocusState((previous) => {
          if (previous.entries.some((entry) => entry.id === id)) {
            return previous
          }

          const entries = [...previous.entries, { id, autoFocus: options.autoFocus, isActive: false }]
          const activeId =
            previous.activeId ?? (previous.enabled && options.autoFocus ? id : nextFocusableId(entries, undefined, 1))

          return { ...previous, entries, activeId }
        })
      },
      remove(id: string) {
        setFocusState((previous) => {
          const entries = previous.entries.filter((entry) => entry.id !== id)
          const activeId =
            previous.activeId === id ? nextFocusableId(entries, undefined, 1) : previous.activeId
          return { ...previous, entries, activeId }
        })
      },
      activate(id: string) {
        setFocusState((previous) => {
          const entries = previous.entries.map((entry) => (entry.id === id ? { ...entry, isActive: true } : entry))
          const activeId =
            previous.activeId && getFocusableIds(entries).includes(previous.activeId)
              ? previous.activeId
              : previous.enabled
                ? nextFocusableId(entries, undefined, 1)
                : undefined

          return { ...previous, entries, activeId }
        })
      },
      deactivate(id: string) {
        setFocusState((previous) => {
          const entries = previous.entries.map((entry) => (entry.id === id ? { ...entry, isActive: false } : entry))
          const activeId =
            previous.activeId === id ? nextFocusableId(entries, undefined, 1) : previous.activeId
          return { ...previous, entries, activeId }
        })
      },
      enableFocus() {
        setFocusState((previous) => ({
          ...previous,
          enabled: true,
          activeId: previous.activeId ?? nextFocusableId(previous.entries, undefined, 1),
        }))
      },
      disableFocus() {
        setFocusState((previous) => ({
          ...previous,
          enabled: false,
          activeId: undefined,
        }))
      },
      focusNext,
      focusPrevious,
      focus(id: string) {
        setFocusState((previous) => {
          if (!previous.enabled || !getFocusableIds(previous.entries).includes(id)) {
            return previous
          }

          return { ...previous, activeId: id }
        })
      },
    }
  }, [focusNext, focusPrevious, focusState.activeId])

  const stdinContextValue = useMemo<StdinContextValue>(
    () => ({
      stdin: session.stdin,
      setRawMode: session.setRawMode,
      setBracketedPasteMode: session.setBracketedPasteMode,
      isRawModeSupported: typeof (session.stdin as NodeJS.ReadStream & { setRawMode?: unknown }).setRawMode === "function",
      internal_exitOnCtrlC: session.exitOnCtrlC,
      internal_eventEmitter: session.stdinEventEmitter,
    }),
    [session],
  )

  const appContextValue = useMemo(
    () => ({
      exit: session.exit,
      waitUntilRenderFlush: session.waitUntilRenderFlush,
    }),
    [session],
  )

  const stdoutContextValue = useMemo(
    () => ({
      stdout: session.stdout,
      write: session.writeStdout,
    }),
    [session],
  )

  const stderrContextValue = useMemo(
    () => ({
      stderr: session.stderr,
      write: session.writeStderr,
    }),
    [session],
  )

  const cursorContextValue = useMemo(
    () => ({
      setCursorPosition: session.setCursorPosition.bind(session),
    }),
    [session],
  )

  return (
    <SessionContext.Provider value={session}>
      <AppContext.Provider value={appContextValue}>
        <StdinContext.Provider value={stdinContextValue}>
          <StdoutContext.Provider value={stdoutContextValue}>
            <StderrContext.Provider value={stderrContextValue}>
              <FocusContext.Provider value={focusContextValue}>
                <CursorContext.Provider value={cursorContextValue}>
                  <accessibilityContext.Provider value={{ isScreenReaderEnabled: session.isScreenReaderEnabled }}>
                    <backgroundContext.Provider value={undefined}>
                      <TextContext.Provider value={{ insideText: false }}>
                        <ErrorBoundary>
                          {React.createElement("box", { flexDirection: "column" }, ...staticEntries, children)}
                        </ErrorBoundary>
                      </TextContext.Provider>
                    </backgroundContext.Provider>
                  </accessibilityContext.Provider>
                </CursorContext.Provider>
              </FocusContext.Provider>
            </StderrContext.Provider>
          </StdoutContext.Provider>
        </StdinContext.Provider>
      </AppContext.Provider>
    </SessionContext.Provider>
  )
}

export function createBrowserSession(options: CreateBrowserSessionOptions): OpenInkSession {
  const renderer = new BrowserRenderer(options.host, {
    autoFocus: options.autoFocus,
    useMouse: options.useMouse,
    enableMouseMovement: options.enableMouseMovement,
    backgroundColor: options.backgroundColor,
  } satisfies BrowserRendererConfig)

  const stdout = createStreamLike(renderer.width, renderer.height)
  const stderr = createStreamLike(renderer.width, renderer.height)
  const stdin = createReadStreamLike()

  renderer.on(BrowserRenderEvents.RESIZE, (width: number, height: number) => {
    ;(stdout as NodeJS.WriteStream & { columns: number; rows: number }).columns = width
    ;(stdout as NodeJS.WriteStream & { columns: number; rows: number }).rows = height
    ;(stderr as NodeJS.WriteStream & { columns: number; rows: number }).columns = width
    ;(stderr as NodeJS.WriteStream & { columns: number; rows: number }).rows = height
    stdout.emit("resize")
    stderr.emit("resize")
  })

  return new OpenInkSession({
    renderer,
    stdin,
    stdout,
    stderr,
    isScreenReaderEnabled: options.isScreenReaderEnabled ?? defaultScreenReaderEnabled(),
    concurrent: options.concurrent ?? false,
    onRender: options.onRender,
  })
}

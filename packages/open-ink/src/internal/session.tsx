import { EventEmitter } from "node:events"
import { PassThrough, Readable } from "node:stream"
import util from "node:util"
import process from "node:process"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CliRenderEvents, CliRenderer, buildKittyKeyboardFlags, engine, resolveRenderLib } from "@opentui/core"
import { BrowserRenderEvents, BrowserRenderer } from "@opentui/core/browser"
import type { CliRendererConfig, KeyEvent, PasteEvent } from "@opentui/core"
import type { BrowserRendererConfig, BrowserTerminalHost } from "@opentui/core/browser"
import { runtime } from "./runtime.js"
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

type RendererLike = CliRenderer | BrowserRenderer
type RootContainer = ReturnType<typeof runtime.createContainer>
type CommitListener = () => void
type FocusEntry = {
  id: string
  autoFocus: boolean
  isActive: boolean
}

export interface RenderMetrics {
  width: number
  height: number
  columns: number
  rows: number
}

interface SessionOptions {
  renderer: RendererLike
  stdin: NodeJS.ReadStream
  stdout: NodeJS.WriteStream
  stderr: NodeJS.WriteStream
  interactive: boolean
  debug: boolean
  patchConsole: boolean
  exitOnCtrlC: boolean
  isScreenReaderEnabled: boolean
  concurrent: boolean
  manualFrames: boolean
  onRender?: (metrics: RenderMetrics) => void
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

function createSyncCliRenderer(config: CliRendererConfig, setupTerminal: boolean): CliRenderer {
  const stdin = config.stdin || process.stdin
  const stdout = config.stdout || process.stdout

  const width = stdout.columns || 80
  const height = stdout.rows || 24
  const renderHeight =
    config.experimental_splitHeight && config.experimental_splitHeight > 0 ? config.experimental_splitHeight : height

  const ziglib = resolveRenderLib()
  const rendererPtr = ziglib.createRenderer(width, renderHeight, {
    remote: config.remote ?? false,
    testing: config.testing ?? false,
  })

  if (!rendererPtr) {
    throw new Error("Failed to create renderer")
  }

  if (config.useThread === undefined) {
    config.useThread = true
  }

  if (process.platform === "linux") {
    config.useThread = false
  }

  ziglib.setUseThread(rendererPtr, config.useThread)
  ziglib.setKittyKeyboardFlags(rendererPtr, buildKittyKeyboardFlags(config.useKittyKeyboard ?? {}))

  const renderer = new CliRenderer(ziglib, rendererPtr, stdin, stdout, width, height, config)

  if (config.testing || !setupTerminal) {
    process.off("SIGWINCH", (renderer as any)["sigwinchHandler"])
    renderer.disableStdoutInterception()
  } else {
    void renderer.setupTerminal()
  }

  return renderer
}

export class OpenInkSession {
  public readonly renderer: RendererLike
  public readonly stdin: NodeJS.ReadStream
  public readonly stdout: NodeJS.WriteStream
  public readonly stderr: NodeJS.WriteStream
  public readonly interactive: boolean
  public readonly debug: boolean
  public readonly exitOnCtrlC: boolean
  public readonly isScreenReaderEnabled: boolean
  public readonly concurrent: boolean
  public readonly manualFrames: boolean

  public readonly keyInput: EventEmitter
  public readonly stdinEventEmitter = new EventEmitter()

  private readonly container: RootContainer
  private readonly commitListeners = new Set<CommitListener>()
  private readonly pendingFlushResolvers = new Set<() => void>()
  private readonly onRender?: (metrics: RenderMetrics) => void

  private currentNode: React.ReactNode = null
  private currentCursorPosition: CursorPosition | undefined
  private appendStaticEntry?: (node: React.ReactNode) => void
  private clearStaticEntries?: () => void
  private lastFrame = ""
  private destroyed = false
  private unmounting = false
  private rawModeRequests = 0
  private renderCount = 0
  private originalConsole: Partial<typeof console> | null = null
  private exitResolve!: (value: unknown) => void
  private exitReject!: (error: unknown) => void
  private waitUntilExitPromise: Promise<unknown>
  private lastRenderFlush: Promise<void> = Promise.resolve()

  constructor(options: SessionOptions) {
    this.renderer = options.renderer
    this.stdin = options.stdin
    this.stdout = options.stdout
    this.stderr = options.stderr
    this.interactive = options.interactive
    this.debug = options.debug
    this.exitOnCtrlC = options.exitOnCtrlC
    this.isScreenReaderEnabled = options.isScreenReaderEnabled
    this.concurrent = options.concurrent
    this.manualFrames = options.manualFrames
    this.onRender = options.onRender
    this.keyInput = options.renderer.keyInput as unknown as EventEmitter
    this.container = runtime.createContainer(options.renderer.root, {
      concurrent: options.concurrent,
      onCommit: this.handleCommit,
    })
    this.waitUntilExitPromise = new Promise((resolve, reject) => {
      this.exitResolve = resolve
      this.exitReject = reject
    })

    if (this.renderer instanceof CliRenderer) {
      this.renderer.once(CliRenderEvents.DESTROY, () => {
        this.finalizeExit(undefined)
      })
    } else {
      this.renderer.once(BrowserRenderEvents.DESTROY, () => {
        this.finalizeExit(undefined)
      })
    }

    if (options.patchConsole) {
      this.patchConsole()
    }
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
    this.lastRenderFlush = this.interactive ? this.createFlushPromise() : Promise.resolve()
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

    if (!this.interactive && this.lastFrame) {
      const frame = this.lastFrame.endsWith("\n") ? this.lastFrame : `${this.lastFrame}\n`
      this.stdout.write(frame)
    }

    this.destroy()
    this.finalizeExit(errorOrResult)
  }

  public destroy(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    this.restoreConsole()
    this.renderer.destroy()
  }

  public setRawMode = (value: boolean): void => {
    const setRawMode = (this.stdin as NodeJS.ReadStream & { setRawMode?: (value: boolean) => void }).setRawMode
    if (!setRawMode) {
      return
    }

    if (value) {
      this.rawModeRequests += 1
      if (this.rawModeRequests === 1 && !this.interactive) {
        setRawMode.call(this.stdin, true)
      }
      return
    }

    this.rawModeRequests = Math.max(0, this.rawModeRequests - 1)
    if (this.rawModeRequests === 0 && !this.interactive) {
      setRawMode.call(this.stdin, false)
    }
  }

  public setBracketedPasteMode = (_value: boolean): void => {}

  private patchConsole(): void {
    this.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    }

    console.log = (...args: any[]) => {
      this.writeStdout(`${util.format(...args)}\n`)
    }
    console.info = (...args: any[]) => {
      this.writeStdout(`${util.format(...args)}\n`)
    }
    console.warn = (...args: any[]) => {
      this.writeStderr(`${util.format(...args)}\n`)
    }
    console.error = (...args: any[]) => {
      this.writeStderr(`${util.format(...args)}\n`)
    }
    console.debug = (...args: any[]) => {
      this.writeStderr(`${util.format(...args)}\n`)
    }
  }

  private restoreConsole(): void {
    if (!this.originalConsole) {
      return
    }

    console.log = this.originalConsole.log ?? console.log
    console.info = this.originalConsole.info ?? console.info
    console.warn = this.originalConsole.warn ?? console.warn
    console.error = this.originalConsole.error ?? console.error
    console.debug = this.originalConsole.debug ?? console.debug
    this.originalConsole = null
  }

  private createFlushPromise(): Promise<void> {
    return new Promise((resolve) => {
      this.pendingFlushResolvers.add(resolve)
    })
  }

  private resolveFlushes = async (): Promise<void> => {
    if (this.pendingFlushResolvers.size === 0) {
      return
    }

    if (this.renderer instanceof CliRenderer) {
      await this.renderer.idle()
    } else {
      await Promise.resolve()
      await Promise.resolve()
    }

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

  private renderFrameSync(): void {
    if (this.renderer instanceof CliRenderer) {
      const renderer = this.renderer as any
      this.renderer.nextRenderBuffer.clear()
      this.renderer.root.render(this.renderer.nextRenderBuffer, 0)
      renderer.renderNative()
      this.lastFrame = decodeFrame(this.renderer.currentRenderBuffer)
      return
    }

    const renderer = this.renderer as any
    renderer.renderFrame()
  }

  private handleCommit = (): void => {
    if (this.manualFrames) {
      this.renderFrameSync()
      if (this.debug && this.lastFrame) {
        const frame = this.lastFrame.endsWith("\n") ? this.lastFrame : `${this.lastFrame}\n`
        this.stdout.write(frame)
      }
    }

    this.applyCursorPosition()

    const metrics: RenderMetrics = {
      width: this.renderer.width,
      height: this.renderer.height,
      columns: this.renderer.width,
      rows: this.renderer.height,
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

function decodeFrame(rendererBuffer: CliRenderer["currentRenderBuffer"]): string {
  const decoder = new TextDecoder()
  return decoder.decode(rendererBuffer.getRealCharBytes(true)).replace(/\s+$/u, "")
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
      isRawModeSupported: typeof (session.stdin as any).setRawMode === "function",
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

export interface CreateCliSessionOptions {
  stdout?: NodeJS.WriteStream
  stdin?: NodeJS.ReadStream
  stderr?: NodeJS.WriteStream
  debug?: boolean
  exitOnCtrlC?: boolean
  patchConsole?: boolean
  onRender?: (metrics: RenderMetrics) => void
  isScreenReaderEnabled?: boolean
  concurrent?: boolean
  interactive?: boolean
  alternateScreen?: boolean
  useMouse?: boolean
  enableMouseMovement?: boolean
  autoFocus?: boolean
  backgroundColor?: string
  maxFps?: number
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

export function createCliSession(options: CreateCliSessionOptions = {}): OpenInkSession {
  const stdout = options.stdout ?? process.stdout
  const stderr = options.stderr ?? process.stderr
  const stdin = options.stdin ?? process.stdin
  const interactive = options.interactive ?? Boolean(stdout.isTTY)
  const renderer = createSyncCliRenderer(
    {
      stdout,
      stdin,
      exitOnCtrlC: options.exitOnCtrlC ?? true,
      useAlternateScreen: interactive && (options.alternateScreen ?? false),
      useMouse: options.useMouse ?? true,
      enableMouseMovement: options.enableMouseMovement ?? true,
      autoFocus: options.autoFocus ?? true,
      backgroundColor: options.backgroundColor,
      targetFps: options.maxFps,
      maxFps: options.maxFps,
      useConsole: false,
      testing: !interactive,
    },
    interactive,
  )

  engine.attach(renderer)

  return new OpenInkSession({
    renderer,
    stdin,
    stdout,
    stderr,
    interactive,
    debug: options.debug ?? false,
    patchConsole: options.patchConsole ?? true,
    exitOnCtrlC: options.exitOnCtrlC ?? true,
    isScreenReaderEnabled: options.isScreenReaderEnabled ?? false,
    concurrent: options.concurrent ?? false,
    manualFrames: !interactive,
    onRender: options.onRender,
  })
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
    stdout.emit("resize")
  })

  return new OpenInkSession({
    renderer,
    stdin,
    stdout,
    stderr,
    interactive: true,
    debug: false,
    patchConsole: false,
    exitOnCtrlC: true,
    isScreenReaderEnabled: options.isScreenReaderEnabled ?? false,
    concurrent: options.concurrent ?? false,
    manualFrames: false,
    onRender: options.onRender,
  })
}

export function createHeadlessSession(columns: number = 80): OpenInkSession {
  const stdout = createStreamLike(columns, 24)
  const stderr = createStreamLike(columns, 24)
  const stdin = createReadStreamLike()
  const renderer = createSyncCliRenderer(
    {
      stdout,
      stdin,
      useConsole: false,
      useAlternateScreen: false,
      testing: true,
    },
    false,
  )

  return new OpenInkSession({
    renderer,
    stdin,
    stdout,
    stderr,
    interactive: false,
    debug: false,
    patchConsole: false,
    exitOnCtrlC: false,
    isScreenReaderEnabled: false,
    concurrent: false,
    manualFrames: true,
  })
}

export function getHeadlessOutput(session: OpenInkSession): string {
  return session["lastFrame"]
}

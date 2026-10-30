import process from "node:process"
import * as core from "@opentui/core"
import {
  CliRenderer,
  NativeError,
  NativeStatus,
  RGBA,
  engine,
  parseColor,
  type CliRendererConfig,
  type OptimizedBuffer,
} from "@opentui/core"
import { installCore } from "./core.js"
import {
  defaultInteractive,
  defaultScreenReaderEnabled,
  normalizeKittyKeyboardOptions,
  type KittyKeyboardOptions,
} from "./options.js"
import {
  OpenInkSession,
  createReadStreamLike,
  createStreamLike,
  trackRendererSize,
  type CapturedFrame,
  type FrameSource,
  type RenderMetrics,
} from "./session.js"

installCore(core)

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
  incrementalRendering?: boolean
  useMouse?: boolean
  enableMouseMovement?: boolean
  autoFocus?: boolean
  backgroundColor?: string
  maxFps?: number
  kittyKeyboard?: KittyKeyboardOptions
}

const decoder = new TextDecoder()

function readFrame(buffer: OptimizedBuffer): CapturedFrame {
  return {
    text: decoder.decode(buffer.getRealCharBytes(true)).replace(/\s+$/u, ""),
    lines: buffer.getSpanLines(),
  }
}

// Paints into the renderer's next buffer and reads it back without presenting, so the renderer's
// own loop keeps ownership of output.
function createFrameSource(renderer: CliRenderer, backgroundColor: string | undefined): FrameSource {
  const background = backgroundColor === undefined ? RGBA.fromInts(0, 0, 0, 0) : RGBA.clone(parseColor(backgroundColor))

  return {
    capture() {
      if (renderer.getSchedulerState().isRendering) {
        return null
      }

      const scene = renderer.nativeScene
      try {
        scene.paint(0, () => ({ background, useMouse: false, excludedHitNum: 0 }))
        return readFrame(renderer.nextRenderBuffer)
      } catch (error) {
        if (error instanceof NativeError && error.status === NativeStatus.OutputBusy) {
          return null
        }
        throw error
      } finally {
        scene.cancelFrame()
      }
    },
    readPresented() {
      return readFrame(renderer.currentRenderBuffer)
    },
  }
}

function createManualRenderer(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  config: CliRendererConfig = {},
): CliRenderer {
  return new CliRenderer(stdin, stdout, stdout.columns || 80, stdout.rows || 24, {
    ...config,
    bufferedOutput: "memory",
    screenMode: "main-screen",
    consoleMode: "disabled",
    exitOnCtrlC: false,
    exitSignals: [],
  })
}

export function createCliSession(options: CreateCliSessionOptions = {}): OpenInkSession {
  const stdout = options.stdout ?? process.stdout
  const stderr = options.stderr ?? process.stderr
  const stdin = options.stdin ?? process.stdin
  const interactive = options.interactive ?? defaultInteractive(stdout)
  const exitOnCtrlC = options.exitOnCtrlC ?? true
  const config: CliRendererConfig = {
    useMouse: options.useMouse ?? true,
    enableMouseMovement: options.enableMouseMovement ?? true,
    autoFocus: options.autoFocus ?? true,
    backgroundColor: options.backgroundColor,
    targetFps: options.maxFps,
    maxFps: options.maxFps,
    useKittyKeyboard: normalizeKittyKeyboardOptions(options.kittyKeyboard),
  }

  let renderer: CliRenderer
  if (interactive) {
    renderer = new CliRenderer(stdin, stdout, stdout.columns || 80, stdout.rows || 24, {
      ...config,
      screenMode: options.alternateScreen ? "alternate-screen" : "main-screen",
      // Like Ink, leave the last frame on the main screen after exit.
      clearOnShutdown: Boolean(options.alternateScreen),
      consoleMode: "disabled",
      // The session owns Ctrl+C so it can unmount the tree before the renderer goes away.
      exitOnCtrlC: false,
    })
    renderer.setupTerminal().catch((error: unknown) => {
      stderr.write(`open-ink: failed to set up the terminal: ${String(error)}\n`)
      renderer.destroy()
    })
    engine.attach(renderer)
  } else {
    renderer = createManualRenderer(stdin, stdout, config)
  }

  return new OpenInkSession({
    renderer,
    stdin,
    stdout,
    stderr,
    interactive,
    debug: options.debug ?? false,
    patchConsole: options.patchConsole ?? true,
    exitOnCtrlC,
    isScreenReaderEnabled: options.isScreenReaderEnabled ?? defaultScreenReaderEnabled(),
    concurrent: options.concurrent ?? false,
    frames: interactive ? undefined : createFrameSource(renderer, options.backgroundColor),
    onRender: options.onRender,
  })
}

export function createHeadlessSession(columns: number = 80): OpenInkSession {
  const stdout = createStreamLike(columns, 24)
  const stderr = createStreamLike(columns, 24)
  const stdin = createReadStreamLike()
  const renderer = createManualRenderer(stdin, stdout, { useMouse: false })
  trackRendererSize(renderer, stdout)

  return new OpenInkSession({
    renderer,
    stdin,
    stdout,
    stderr,
    interactive: false,
    debug: false,
    patchConsole: false,
    exitOnCtrlC: false,
    isScreenReaderEnabled: defaultScreenReaderEnabled(),
    concurrent: false,
    frames: createFrameSource(renderer, undefined),
  })
}

export function getHeadlessOutput(session: OpenInkSession): string {
  return session.output
}

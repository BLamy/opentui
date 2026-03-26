import type { MonacoExtraLibSource } from "./example-editor-monaco-types"

const DOCS_EXAMPLE_MONACO_RUNTIME_TYPES_ROOT = "file:///opentui-doc-examples/runtime-types"

const GLOBAL_JSX_TYPES = `
declare namespace JSX {
  type Element = any
  interface ElementChildrenAttribute {
    children: {}
  }
  interface IntrinsicAttributes {
    key?: string | number
  }
  interface IntrinsicElements {
    [elementName: string]: any
  }
}
`.trim()

const REACT_MODULE_TYPES = `
declare module "react" {
  export type ReactNode = any
  export type ReactElement<P = any> = {
    props: P
    type: any
    key: string | number | null
  }
  export type RefObject<T> = { current: T | null }
  export type MutableRefObject<T> = { current: T }
  export interface Context<T> {
    Provider: (props: { value: T; children?: ReactNode }) => JSX.Element
    Consumer: any
  }
  export function createElement(type: any, props?: any, ...children: any[]): JSX.Element
  export function createContext<T>(defaultValue: T): Context<T>
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]): T
  export function useContext<T>(context: Context<T>): T
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T
  export function useRef<T>(initialValue: T | null): MutableRefObject<T | null>
  export function useState<T>(initialValue: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void]
  export const Fragment: (props: { children?: ReactNode }) => JSX.Element
  const React: {
    Fragment: typeof Fragment
    createElement: typeof createElement
    createContext: typeof createContext
    useCallback: typeof useCallback
    useContext: typeof useContext
    useEffect: typeof useEffect
    useLayoutEffect: typeof useLayoutEffect
    useMemo: typeof useMemo
    useRef: typeof useRef
    useState: typeof useState
  }
  export default React
}
`.trim()

const REACT_JSX_RUNTIME_TYPES = `
declare module "react/jsx-runtime" {
  export const Fragment: any
  export function jsx(type: any, props: any, key?: string): JSX.Element
  export function jsxs(type: any, props: any, key?: string): JSX.Element
}
`.trim()

const REACT_JSX_DEV_RUNTIME_TYPES = `
declare module "react/jsx-dev-runtime" {
  export const Fragment: any
  export function jsxDEV(type: any, props: any, key: string | undefined, isStaticChildren: boolean, source: any, self: any): JSX.Element
}
`.trim()

const OPEN_INK_TYPES = `
declare module "open-ink" {
  import type { ReactNode } from "react"

  export type DOMElement = Record<string, unknown>
  export type Key = Record<string, boolean | "press" | "repeat" | "release" | undefined>
  export type WindowSize = {
    columns: number
    rows: number
    width: number
    height: number
  }
  export type BoxMetrics = {
    width: number
    height: number
  }
  export type UseBoxMetricsResult = BoxMetrics & {
    hasMeasured: boolean
  }
  export type Instance = {
    rerender(node: ReactNode): void
    unmount(): void
    waitUntilExit(): Promise<unknown>
    waitUntilRenderFlush(): Promise<void>
    cleanup(): void
    clear(): void
  }
  export type RenderOptions = Record<string, unknown>
  export type BrowserRenderOptions = RenderOptions & {
    host?: unknown
  }
  export type RenderToStringOptions = {
    columns?: number
  }
  export type BoxProps = {
    children?: ReactNode
    border?: boolean
    borderStyle?: string
    flexDirection?: string
    gap?: number
    height?: number | string
    padding?: number
    paddingX?: number
    paddingY?: number
    width?: number | string
    [key: string]: any
  }
  export type TextProps = {
    children?: ReactNode
    backgroundColor?: string
    bold?: boolean
    color?: string
    dimColor?: boolean
    italic?: boolean
    underline?: boolean
    wrap?: "wrap" | "truncate" | "truncate-start" | "truncate-middle" | "truncate-end"
    [key: string]: any
  }
  export type NewlineProps = {
    count?: number
  }
  export type StaticProps<T> = {
    items: T[]
    children: (item: T, index: number) => ReactNode
    style?: BoxProps
  }
  export type TransformProps = {
    accessibilityLabel?: string
    children?: ReactNode
    transform: (children: string, index: number) => string
  }
  export function render(node: ReactNode, options?: RenderOptions): Instance
  export function renderToString(node: ReactNode, options?: RenderToStringOptions): string
  export function measureElement(element: DOMElement): BoxMetrics
  export function Box(props: BoxProps): JSX.Element
  export function Text(props: TextProps): JSX.Element
  export function Newline(props: NewlineProps): JSX.Element
  export function Spacer(props: { size?: number }): JSX.Element
  export function Static<T>(props: StaticProps<T>): JSX.Element
  export function Transform(props: TransformProps): JSX.Element
  export function useApp(): {
    exit(error?: unknown): void
    waitUntilRenderFlush(): Promise<void>
  }
  export function useBoxMetrics(target: { current: DOMElement | null }): UseBoxMetricsResult
  export function useCursor(): {
    setCursorPosition(position?: { x: number; y: number }): void
  }
  export function useFocus(options?: { autoFocus?: boolean; id?: string; isActive?: boolean }): {
    focus(id: string): void
    isFocused: boolean
  }
  export function useFocusManager(): {
    activeId?: string
    disableFocus(): void
    enableFocus(): void
    focus(id: string): void
    focusNext(): void
    focusPrevious(): void
  }
  export function useInput(handler: (input: string, key: Key) => void, options?: { isActive?: boolean }): void
  export function useIsScreenReaderEnabled(): boolean
  export function usePaste(handler: (value: string) => void, options?: { isActive?: boolean }): void
  export function useStderr(): {
    stderr: unknown
    write(data: string): void
  }
  export function useStdin(): {
    stdin: unknown
    setRawMode(value: boolean): void
  }
  export function useStdout(): {
    stdout: unknown
    write(data: string): void
  }
  export function useWindowSize(): WindowSize
}

declare module "open-ink/browser" {
  export * from "open-ink"
}
`.trim()

export function createPreviewRuntimeMonacoExtraLibs(): MonacoExtraLibSource[] {
  return [
    {
      filePath: `${DOCS_EXAMPLE_MONACO_RUNTIME_TYPES_ROOT}/jsx-global.d.ts`,
      content: GLOBAL_JSX_TYPES,
    },
    {
      filePath: `${DOCS_EXAMPLE_MONACO_RUNTIME_TYPES_ROOT}/react.d.ts`,
      content: REACT_MODULE_TYPES,
    },
    {
      filePath: `${DOCS_EXAMPLE_MONACO_RUNTIME_TYPES_ROOT}/react-jsx-runtime.d.ts`,
      content: REACT_JSX_RUNTIME_TYPES,
    },
    {
      filePath: `${DOCS_EXAMPLE_MONACO_RUNTIME_TYPES_ROOT}/react-jsx-dev-runtime.d.ts`,
      content: REACT_JSX_DEV_RUNTIME_TYPES,
    },
    {
      filePath: `${DOCS_EXAMPLE_MONACO_RUNTIME_TYPES_ROOT}/open-ink.d.ts`,
      content: OPEN_INK_TYPES,
    },
  ]
}

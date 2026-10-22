import type { BaseRenderable, RenderContext, RootRenderable, TextNodeRenderable } from "@opentui/core"
import { createContext, type ReactNode } from "react"
import ReactReconciler, { type HostConfig, type OpaqueRoot, type ReactContext } from "react-reconciler"
import { ConcurrentRoot, DefaultEventPriority, LegacyRoot, NoEventPriority } from "react-reconciler/constants.js"

// Core classes are never imported as values here. Browser hosts load @opentui/core only after the
// wasm bindings are installed, so everything that touches core arrives through the options.

export type RenderableConstructor<TRenderable extends BaseRenderable = BaseRenderable> = new (
  ctx: RenderContext,
  options: any,
) => TRenderable

export type RuntimeComponentCatalogue = Record<string, RenderableConstructor>

export type RuntimeType = string
export type RuntimeProps = Record<string, any>
export type RuntimeContainer = RootRenderable
export type RuntimeInstance = BaseRenderable
export type RuntimeTextInstance = TextNodeRenderable
export type RuntimePublicInstance = RuntimeInstance
export type RuntimeHostContext = Record<string, any> & { isInsideText?: boolean }

export interface CreateOpenTUIRuntimeOptions {
  rendererPackageName: string
  rendererVersion: string
  getComponentCatalogue: () => RuntimeComponentCatalogue
  textNodeKeys: readonly string[]
  createId: (type: RuntimeType) => string
  createTextInstance: (text: string) => RuntimeTextInstance
  setInitialProperties: (instance: RuntimeInstance, type: RuntimeType, props: RuntimeProps) => void
  updateProperties: (
    instance: RuntimeInstance,
    type: RuntimeType,
    oldProps: RuntimeProps,
    newProps: RuntimeProps,
  ) => void
  // Props passed to the constructor and to setInitialProperties. Lets a renderer hold back props
  // that must only apply once the instance is mounted, together with commitMount.
  getInitialProps?: (type: RuntimeType, props: RuntimeProps) => RuntimeProps
  shouldCommitMount?: (type: RuntimeType, props: RuntimeProps) => boolean
  commitMount?: (instance: RuntimeInstance, type: RuntimeType, props: RuntimeProps) => void
}

export interface CreateRuntimeContainerOptions {
  concurrent?: boolean
  identifierPrefix?: string
  onCommit?: () => void
  onUncaughtError?: (error: unknown) => void
  onCaughtError?: (error: unknown) => void
  onRecoverableError?: (error: unknown) => void
  onDefaultTransitionIndicator?: () => void
}

// Required by the reconciler at runtime but missing from @types/react-reconciler.
// Remove this intersection when DefinitelyTyped catches up.
type ReconcilerExtensions = {
  maySuspendCommitOnUpdate(type: RuntimeType, oldProps: RuntimeProps, newProps: RuntimeProps): boolean
  maySuspendCommitInSyncRender(type: RuntimeType, props: RuntimeProps): boolean
  rendererPackageName: string
  rendererVersion: string
}

export type RuntimeHostConfig = HostConfig<
  RuntimeType,
  RuntimeProps,
  RuntimeContainer,
  RuntimeInstance,
  RuntimeTextInstance,
  unknown, // SuspenseInstance
  unknown, // HydratableInstance
  unknown, // FormInstance
  RuntimePublicInstance,
  RuntimeHostContext,
  unknown, // ChildSet
  unknown, // TimeoutHandle
  unknown, // NoTimeout
  unknown // TransitionStatus
> &
  ReconcilerExtensions

export type OpenTUIReconciler = ReturnType<
  typeof ReactReconciler<
    RuntimeType,
    RuntimeProps,
    RuntimeContainer,
    RuntimeInstance,
    RuntimeTextInstance,
    unknown,
    unknown,
    unknown,
    RuntimePublicInstance,
    RuntimeHostContext,
    unknown,
    unknown,
    unknown,
    unknown
  >
>

export interface OpenTUIRuntime {
  hostConfig: RuntimeHostConfig
  reconciler: OpenTUIReconciler
  createPortal: OpenTUIReconciler["createPortal"]
  flushSync: OpenTUIReconciler["flushSync"]
  flushSyncWork(): void
  injectIntoDevTools(): void
  createContainer(root: RootRenderable, options?: CreateRuntimeContainerOptions): OpaqueRoot
  updateContainer(element: ReactNode, container: OpaqueRoot): void
  updateContainerSync(element: ReactNode, container: OpaqueRoot): void
  unmountContainer(container: OpaqueRoot): void
}

export function createOpenTUIRuntime(options: CreateOpenTUIRuntimeOptions): OpenTUIRuntime {
  let currentUpdatePriority = NoEventPriority
  const commitListeners = new WeakMap<RuntimeContainer, () => void>()
  const textHostTypes = new Set<string>(["text", ...options.textNodeKeys])
  const getInitialProps = options.getInitialProps ?? ((_type: RuntimeType, props: RuntimeProps) => props)

  // https://github.com/facebook/react/tree/main/packages/react-reconciler#practical-examples
  const hostConfig: RuntimeHostConfig = {
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,
    supportsMicrotasks: true,
    scheduleMicrotask: queueMicrotask,

    createInstance(type, props, rootContainerInstance, hostContext) {
      if (options.textNodeKeys.includes(type) && !hostContext.isInsideText) {
        throw new Error(`Component of type "${type}" must be created inside of a text node`)
      }

      const id = options.createId(type)
      const components = options.getComponentCatalogue()

      if (!components[type]) {
        throw new Error(`Unknown component type: ${type}`)
      }

      return new components[type](rootContainerInstance.ctx, {
        id,
        ...getInitialProps(type, props),
      })
    },

    appendChild(parent, child) {
      parent.add(child)
    },

    // During coordinated teardown (for example renderer.destroy() triggering an unmount) the
    // renderable tree may already be destroyed when React commits its deletion effects, so an
    // already-detached child is expected and must not be re-removed.
    removeChild(parent: RuntimeInstance, child: RuntimeInstance) {
      if (!child.parent) return
      parent.remove(child)
    },

    insertBefore(parent, child, beforeChild) {
      parent.insertBefore(child, beforeChild)
    },

    insertInContainerBefore(parent, child, beforeChild) {
      parent.insertBefore(child, beforeChild)
    },

    removeChildFromContainer(parent: RuntimeContainer, child: RuntimeInstance) {
      if (!child.parent) return
      parent.remove(child)
    },

    prepareForCommit() {
      return null
    },

    resetAfterCommit(containerInfo) {
      containerInfo.requestRender()
      commitListeners.get(containerInfo)?.()
    },

    getRootHostContext() {
      return { isInsideText: false }
    },

    getChildHostContext(parentHostContext, type) {
      return { ...parentHostContext, isInsideText: textHostTypes.has(type) }
    },

    shouldSetTextContent() {
      return false
    },

    createTextInstance(text, _rootContainerInstance, hostContext) {
      if (!hostContext.isInsideText) {
        throw new Error("Text must be created inside of a text node")
      }

      return options.createTextInstance(text)
    },

    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,
    noTimeout: -1,

    shouldAttemptEagerTransition() {
      return true
    },

    finalizeInitialChildren(instance, type, props) {
      options.setInitialProperties(instance, type, getInitialProps(type, props))
      return options.shouldCommitMount?.(type, props) ?? false
    },

    commitMount(instance, type, props) {
      options.commitMount?.(instance, type, props)
    },

    // No explicit requestRender() needed in commit methods: core's property setters already call
    // requestRender() internally, and resetAfterCommit handles the frame trigger.
    commitUpdate(instance, type, oldProps, newProps) {
      options.updateProperties(instance, type, oldProps, newProps)
    },

    commitTextUpdate(textInstance, _oldText, newText) {
      textInstance.children = [newText]
    },

    appendChildToContainer(container, child) {
      container.add(child)
    },

    appendInitialChild(parent, child) {
      parent.add(child)
    },

    hideInstance(instance) {
      instance.visible = false
    },

    unhideInstance(instance) {
      instance.visible = true
    },

    hideTextInstance(textInstance) {
      textInstance.visible = false
    },

    unhideTextInstance(textInstance) {
      textInstance.visible = true
    },

    clearContainer(container) {
      for (const child of container.getChildren()) {
        container.remove(child)
      }
    },

    setCurrentUpdatePriority(newPriority: number) {
      currentUpdatePriority = newPriority
    },

    getCurrentUpdatePriority: () => currentUpdatePriority,

    resolveUpdatePriority() {
      if (currentUpdatePriority !== NoEventPriority) {
        return currentUpdatePriority
      }

      return DefaultEventPriority
    },

    maySuspendCommit() {
      return false
    },

    maySuspendCommitOnUpdate() {
      return false
    },

    maySuspendCommitInSyncRender() {
      return false
    },

    NotPendingTransition: null,
    HostTransitionContext: createContext(null) as unknown as ReactContext<null>,
    resetFormInstance() {},
    requestPostPaintCallback() {},
    trackSchedulerEvent() {},
    resolveEventType() {
      return null
    },
    resolveEventTimeStamp() {
      return -1.1
    },
    preloadInstance() {
      return true
    },
    startSuspendingCommit() {},
    suspendInstance() {},
    waitForCommitToBeReady() {
      return null
    },

    detachDeletedInstance(instance) {
      if (!instance.parent) {
        instance.destroyRecursively()
      }
    },

    getPublicInstance(instance) {
      return instance
    },

    preparePortalMount() {},

    isPrimaryRenderer: true,

    getInstanceFromNode() {
      return null
    },

    beforeActiveInstanceBlur() {},
    afterActiveInstanceBlur() {},
    prepareScopeUpdate() {},
    getInstanceFromScope() {
      return null
    },

    rendererPackageName: options.rendererPackageName,
    rendererVersion: options.rendererVersion,
  }

  const reconciler = ReactReconciler(hostConfig)

  // flushSync was renamed to flushSyncFromReconciler in react-reconciler 0.32.0
  const flushSync = (reconciler.flushSyncFromReconciler ?? reconciler.flushSync) as OpenTUIReconciler["flushSync"]

  return {
    hostConfig,
    reconciler,
    createPortal: reconciler.createPortal,
    flushSync,
    flushSyncWork() {
      reconciler.flushSyncWork()
    },
    injectIntoDevTools() {
      // @ts-expect-error the types for `react-reconciler` are not up to date with the library.
      reconciler.injectIntoDevTools()
    },
    createContainer(root, config = {}) {
      if (config.onCommit) {
        commitListeners.set(root, config.onCommit)
      } else {
        commitListeners.delete(root)
      }

      return reconciler.createContainer(
        root,
        config.concurrent === false ? LegacyRoot : ConcurrentRoot,
        null,
        false,
        null,
        config.identifierPrefix ?? "",
        config.onUncaughtError ?? console.error,
        config.onCaughtError ?? console.error,
        config.onRecoverableError ?? console.error,
        config.onDefaultTransitionIndicator ?? (() => {}),
      )
    },
    updateContainer(element, container) {
      reconciler.updateContainer(element, container, null, () => {})
    },
    updateContainerSync(element, container) {
      reconciler.updateContainerSync(element, container, null, () => {})
    },
    unmountContainer(container) {
      reconciler.updateContainerSync(null, container, null, () => {})
    },
  }
}

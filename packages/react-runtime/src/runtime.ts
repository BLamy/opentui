import { TextNodeRenderable, type BaseRenderable, type RootRenderable } from "@opentui/core/browser"
import { createContext } from "react"
import type { HostConfig, ReactContext } from "react-reconciler"
import ReactReconciler from "react-reconciler"
import { ConcurrentRoot, DefaultEventPriority, LegacyRoot, NoEventPriority } from "react-reconciler/constants"

export interface RenderableConstructor<TRenderable extends BaseRenderable = BaseRenderable> {
  new (ctx: RootRenderable["ctx"], options: any): TRenderable
}

export type RuntimeComponentCatalogue = Record<string, RenderableConstructor>

export interface RuntimeHostContext {
  isInsideText?: boolean
}

export type RuntimeContainer = RootRenderable & {
  __opentuiOnCommit?: (() => void) | undefined
}

export interface CreateOpenTUIRuntimeOptions {
  rendererPackageName: string
  rendererVersion: string
  getComponentCatalogue: () => RuntimeComponentCatalogue
  textNodeKeys: readonly string[]
  createId: (type: string) => string
  setInitialProperties: (instance: BaseRenderable, type: string, props: Record<string, any>) => void
  updateProperties: (
    instance: BaseRenderable,
    type: string,
    oldProps: Record<string, any>,
    newProps: Record<string, any>,
  ) => void
}

export interface CreateRuntimeContainerOptions {
  concurrent?: boolean
  identifierPrefix?: string
  onCommit?: () => void
  onUncaughtError?: (error: unknown) => void
  onCaughtError?: (error: unknown) => void
  onRecoverableError?: (error: unknown) => void
  onHostTransitionComplete?: () => void
}

export function createOpenTUIRuntime(options: CreateOpenTUIRuntimeOptions) {
  let currentUpdatePriority = NoEventPriority

  type Type = string
  type Props = Record<string, any>
  type Container = RuntimeContainer
  type Instance = BaseRenderable
  type TextInstance = TextNodeRenderable
  type PublicInstance = Instance
  type HostContext = RuntimeHostContext

  const hostConfig: HostConfig<
    Type,
    Props,
    Container,
    Instance,
    TextInstance,
    unknown,
    unknown,
    unknown,
    PublicInstance,
    HostContext,
    unknown,
    unknown,
    unknown,
    unknown
  > = {
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,

    createInstance(type, props, rootContainerInstance, hostContext) {
      if (options.textNodeKeys.includes(type) && !hostContext.isInsideText) {
        throw new Error(`Component of type "${type}" must be created inside of a text node`)
      }

      const components = options.getComponentCatalogue()
      const Component = components[type]

      if (!Component) {
        throw new Error(`Unknown component type: ${type}`)
      }

      return new Component(rootContainerInstance.ctx, {
        id: options.createId(type),
        ...props,
      })
    },

    appendChild(parent, child) {
      parent.add(child)
    },

    removeChild(parent, child) {
      parent.remove((child as BaseRenderable).id)
    },

    insertBefore(parent, child, beforeChild) {
      parent.insertBefore(child, beforeChild)
    },

    insertInContainerBefore(parent, child, beforeChild) {
      parent.insertBefore(child, beforeChild)
    },

    removeChildFromContainer(parent, child) {
      parent.remove((child as BaseRenderable).id)
    },

    prepareForCommit() {
      return null
    },

    resetAfterCommit(containerInfo) {
      containerInfo.requestRender()
      containerInfo.__opentuiOnCommit?.()
    },

    getRootHostContext() {
      return { isInsideText: false }
    },

    getChildHostContext(parentHostContext, type) {
      const isInsideText = type === "text" || options.textNodeKeys.includes(type)
      return { ...parentHostContext, isInsideText }
    },

    shouldSetTextContent() {
      return false
    },

    createTextInstance(text, _rootContainerInstance, hostContext) {
      if (!hostContext.isInsideText) {
        throw new Error("Text must be created inside of a text node")
      }

      return TextNodeRenderable.fromString(text)
    },

    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,
    noTimeout: -1,

    shouldAttemptEagerTransition() {
      return false
    },

    finalizeInitialChildren(instance, type, props) {
      options.setInitialProperties(instance, type, props)
      return false
    },

    commitMount() {},

    commitUpdate(instance, type, oldProps, newProps) {
      options.updateProperties(instance, type, oldProps, newProps)
      instance.requestRender()
    },

    commitTextUpdate(textInstance, _oldText, newText) {
      textInstance.children = [newText]
      textInstance.requestRender()
    },

    appendChildToContainer(container, child) {
      container.add(child)
    },

    appendInitialChild(parent, child) {
      parent.add(child)
    },

    hideInstance(instance) {
      instance.visible = false
      instance.requestRender()
    },

    unhideInstance(instance) {
      instance.visible = true
      instance.requestRender()
    },

    hideTextInstance(textInstance) {
      textInstance.visible = false
      textInstance.requestRender()
    },

    unhideTextInstance(textInstance) {
      textInstance.visible = true
      textInstance.requestRender()
    },

    clearContainer(container) {
      for (const child of container.getChildren()) {
        container.remove(child.id)
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

    // @ts-expect-error DefinitelyTyped is not up to date
    rendererPackageName: options.rendererPackageName,
    rendererVersion: options.rendererVersion,
  }

  const reconciler = ReactReconciler(hostConfig)
  const extendedReconciler = reconciler as typeof reconciler & {
    flushSyncFromReconciler?: typeof reconciler.flushSync
    flushSyncWork?: () => void
    updateContainerSync?: typeof reconciler.updateContainer
  }

  const flushSync = extendedReconciler.flushSyncFromReconciler ?? extendedReconciler.flushSync

  return {
    hostConfig,
    reconciler,
    createPortal: reconciler.createPortal,
    flushSync,
    flushSyncWork() {
      extendedReconciler.flushSyncWork?.()
    },
    injectIntoDevTools() {
      // @ts-expect-error the types for `react-reconciler` are not up to date with the library.
      reconciler.injectIntoDevTools()
    },
    createContainer(root: RootRenderable, config: CreateRuntimeContainerOptions = {}) {
      const containerInfo = root as RuntimeContainer
      containerInfo.__opentuiOnCommit = config.onCommit

      return reconciler.createContainer(
        containerInfo,
        config.concurrent === false ? LegacyRoot : ConcurrentRoot,
        null,
        false,
        null,
        config.identifierPrefix ?? "",
        config.onUncaughtError ?? console.error,
        config.onCaughtError ?? console.error,
        config.onRecoverableError ?? console.error,
        config.onHostTransitionComplete ?? console.error,
        null,
      )
    },
    updateContainer(element: React.ReactNode, container: ReturnType<typeof reconciler.createContainer>) {
      reconciler.updateContainer(element, container, null, () => {})
    },
    updateContainerSync(element: React.ReactNode, container: ReturnType<typeof reconciler.createContainer>) {
      if (extendedReconciler.updateContainerSync) {
        extendedReconciler.updateContainerSync(element, container, null, () => {})
        return
      }

      flushSync(() => {
        reconciler.updateContainer(element, container, null, () => {})
      })
    },
    unmountContainer(container: ReturnType<typeof reconciler.createContainer>) {
      reconciler.updateContainer(null, container, null, () => {})
    },
  }
}

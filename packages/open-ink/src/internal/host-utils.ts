import { isRenderable, type BaseRenderable } from "@opentui/core/browser"

type Props = Record<string, any>

function setProperty(instance: BaseRenderable, propKey: string, propValue: any): void {
  switch (propKey) {
    case "children":
      break
    case "focused":
      if (isRenderable(instance)) {
        if (propValue) {
          instance.focus()
        } else {
          instance.blur()
        }
      }
      break
    default:
      // @ts-expect-error host props are assigned dynamically by the renderer
      instance[propKey] = propValue
  }
}

export function setInitialProperties(instance: BaseRenderable, _type: string, props: Props): void {
  for (const propKey in props) {
    if (!Object.prototype.hasOwnProperty.call(props, propKey)) {
      continue
    }

    const value = props[propKey]
    if (value == null) {
      continue
    }

    setProperty(instance, propKey, value)
  }
}

export function updateProperties(instance: BaseRenderable, _type: string, oldProps: Props, newProps: Props): void {
  for (const propKey in oldProps) {
    if (Object.prototype.hasOwnProperty.call(oldProps, propKey) && oldProps[propKey] != null && !(propKey in newProps)) {
      setProperty(instance, propKey, null)
    }
  }

  for (const propKey in newProps) {
    if (!Object.prototype.hasOwnProperty.call(newProps, propKey)) {
      continue
    }

    const newValue = newProps[propKey]
    const oldValue = oldProps[propKey]
    if (newValue !== oldValue && (newValue != null || oldValue != null)) {
      setProperty(instance, propKey, newValue)
    }
  }
}

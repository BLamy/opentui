import React, { useLayoutEffect, useMemo, useState } from "react"
import type { Props as BoxProps } from "./box.js"
import { Box } from "./box.js"
import { useSession } from "../context/session.js"

export type Props<T> = {
  items: T[]
  style?: BoxProps
  children: (item: T, index: number) => React.ReactNode
}

export function Static<T>(props: Props<T>): React.ReactNode {
  const { items, children: render, style = {} } = props
  const session = useSession()
  const [index, setIndex] = useState(0)

  const itemsToRender = useMemo(() => items.slice(index), [index, items])

  useLayoutEffect(() => {
    if (itemsToRender.length === 0) {
      return
    }

    session.appendStaticNode(
      <Box position="relative" flexDirection="column" {...style}>
        {itemsToRender.map((item, itemIndex) => render(item, index + itemIndex))}
      </Box>,
    )
    setIndex(items.length)
  }, [index, items.length, itemsToRender, render, session, style])

  return null
}

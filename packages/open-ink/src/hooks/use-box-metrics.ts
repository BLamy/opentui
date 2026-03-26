import { useCallback, useEffect, useMemo, useState, type RefObject } from "react"
import type { Renderable } from "@opentui/core/browser"
import useStdout from "./use-stdout.js"
import { useSession } from "../context/session.js"

export type DOMElement = Renderable

export type BoxMetrics = {
  readonly width: number
  readonly height: number
  readonly left: number
  readonly top: number
}

export type UseBoxMetricsResult = BoxMetrics & {
  readonly hasMeasured: boolean
}

const emptyMetrics: BoxMetrics = {
  width: 0,
  height: 0,
  left: 0,
  top: 0,
}

export default function useBoxMetrics(ref: RefObject<DOMElement | null>): UseBoxMetricsResult {
  const session = useSession()
  const { stdout } = useStdout()
  const [metrics, setMetrics] = useState<BoxMetrics>(emptyMetrics)
  const [hasMeasured, setHasMeasured] = useState(false)

  const updateMetrics = useCallback(() => {
    const layout = ref.current?.getLayoutNode().getComputedLayout() ?? emptyMetrics
    setMetrics((previous) => {
      const changed =
        previous.width !== layout.width ||
        previous.height !== layout.height ||
        previous.left !== layout.left ||
        previous.top !== layout.top

      return changed ? layout : previous
    })
    setHasMeasured(Boolean(ref.current))
  }, [ref])

  useEffect(updateMetrics)

  useEffect(() => session.addCommitListener(updateMetrics), [session, updateMetrics])

  useEffect(() => {
    stdout.on("resize", updateMetrics)
    return () => {
      stdout.off("resize", updateMetrics)
    }
  }, [stdout, updateMetrics])

  return useMemo(
    () => ({
      ...metrics,
      hasMeasured,
    }),
    [hasMeasured, metrics],
  )
}

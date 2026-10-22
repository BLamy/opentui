import { useEffect, useState } from "react"
import useStdout from "./use-stdout.js"

export type WindowSize = {
  columns: number
  rows: number
}

export default function useWindowSize(): WindowSize {
  const { stdout } = useStdout()
  const [size, setSize] = useState<WindowSize>({
    columns: stdout.columns ?? 0,
    rows: stdout.rows ?? 0,
  })

  useEffect(() => {
    const onResize = () => {
      setSize({
        columns: stdout.columns ?? 0,
        rows: stdout.rows ?? 0,
      })
    }

    stdout.on("resize", onResize)
    return () => {
      stdout.off("resize", onResize)
    }
  }, [stdout])

  return size
}

import { useContext } from "react"
import { accessibilityContext } from "../context/accessibility.js"

export default function useIsScreenReaderEnabled(): boolean {
  const { isScreenReaderEnabled } = useContext(accessibilityContext)
  return isScreenReaderEnabled
}

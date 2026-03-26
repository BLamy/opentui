import { useContext } from "react"
import { StderrContext } from "../context/stderr.js"

export default function useStderr() {
  return useContext(StderrContext)
}

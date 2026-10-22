import { useContext } from "react"
import { StdoutContext } from "../context/stdout.js"

export default function useStdout() {
  return useContext(StdoutContext)
}

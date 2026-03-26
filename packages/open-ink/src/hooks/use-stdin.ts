import { useContext } from "react"
import { StdinContext, type StdinContextValue, type StdinPublicProps } from "../context/stdin.js"

export default function useStdin(): StdinPublicProps {
  return useContext(StdinContext)
}

export function useStdinContext(): StdinContextValue {
  return useContext(StdinContext)
}

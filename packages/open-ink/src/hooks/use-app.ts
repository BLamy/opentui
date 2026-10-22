import { useContext } from "react"
import { AppContext } from "../context/app.js"

export default function useApp() {
  return useContext(AppContext)
}

import React from "react"
import { Box } from "./box.js"

export function Spacer(): React.ReactNode {
  return <Box flexGrow={1} />
}

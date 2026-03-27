import process from "node:process"
import type { KittyKeyboardOptions as CoreKittyKeyboardOptions } from "@opentui/core"

export type KittyKeyboardFlag =
  | "disambiguateEscapeCodes"
  | "reportEventTypes"
  | "reportAlternateKeys"
  | "reportAllKeysAsEscapeCodes"
  | "reportAssociatedText"

export interface KittyKeyboardOptions {
  mode?: "auto" | "enabled" | "disabled"
  flags?: KittyKeyboardFlag[]
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  return !["0", "false", "no"].includes(value.toLowerCase())
}

export function isInCi(): boolean {
  return isTruthyEnv(process.env.CI)
}

export function defaultInteractive(stdout: NodeJS.WriteStream): boolean {
  return Boolean(stdout.isTTY) && !isInCi()
}

export function defaultScreenReaderEnabled(): boolean {
  return process.env.INK_SCREEN_READER === "true"
}

export function normalizeKittyKeyboardOptions(
  options: KittyKeyboardOptions | undefined,
): CoreKittyKeyboardOptions | null {
  if (!options || options.mode === "disabled") {
    return null
  }

  const flags = options.flags ?? ["disambiguateEscapeCodes"]

  return {
    disambiguate: flags.includes("disambiguateEscapeCodes"),
    events: flags.includes("reportEventTypes"),
    alternateKeys: flags.includes("reportAlternateKeys"),
    allKeysAsEscapes: flags.includes("reportAllKeysAsEscapeCodes"),
    reportText: flags.includes("reportAssociatedText"),
  }
}

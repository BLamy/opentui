import React, { type ReactNode } from "react"
import {
  StyledText,
  TextAttributes,
  createTextAttributes,
  parseColor,
  type RGBA,
  type TextNodeOptions,
} from "@opentui/core/browser"
import { OPEN_INK_NEWLINE, OPEN_INK_TEXT } from "./markers.js"

type TextChunkLike = {
  __isChunk: true
  text: string
  fg?: RGBA
  bg?: RGBA
  attributes?: number
  link?: { url: string }
}

interface ChunkStyle {
  fg?: RGBA
  bg?: RGBA
  attributes: number
  link?: { url: string }
}

type CharacterToken = {
  char: string
  style: ChunkStyle
}

type FlattenOptions = {
  strict?: boolean
}

function normalizeTextStyle(
  parent: ChunkStyle,
  props: {
    color?: string
    backgroundColor?: string
    dimColor?: boolean
    bold?: boolean
    italic?: boolean
    underline?: boolean
    strikethrough?: boolean
    inverse?: boolean
    href?: string
  },
): ChunkStyle {
  return {
    fg: props.color ? parseColor(props.color) : parent.fg,
    bg: props.backgroundColor ? parseColor(props.backgroundColor) : parent.bg,
    attributes:
      parent.attributes |
      createTextAttributes({
        dim: props.dimColor,
        bold: props.bold,
        italic: props.italic,
        underline: props.underline,
        strikethrough: props.strikethrough,
        inverse: props.inverse,
      }),
    link: props.href ? { url: props.href } : parent.link,
  }
}

function cloneStyle(style: ChunkStyle): ChunkStyle {
  return {
    fg: style.fg,
    bg: style.bg,
    attributes: style.attributes,
    link: style.link,
  }
}

function styleEquals(left: ChunkStyle, right: ChunkStyle): boolean {
  const sameLink = left.link?.url === right.link?.url
  const sameFg = left.fg === right.fg || left.fg?.equals(right.fg)
  const sameBg = left.bg === right.bg || left.bg?.equals(right.bg)

  return sameLink && sameFg && sameBg && left.attributes === right.attributes
}

function createChunk(text: string, style: ChunkStyle): TextChunkLike {
  return {
    __isChunk: true,
    text,
    fg: style.fg,
    bg: style.bg,
    attributes: style.attributes,
    link: style.link,
  }
}

function toCharacters(styledText: StyledText): CharacterToken[] {
  const characters: CharacterToken[] = []

  for (const chunk of styledText.chunks as TextChunkLike[]) {
    const style = cloneStyle({
      fg: chunk.fg,
      bg: chunk.bg,
      attributes: chunk.attributes ?? 0,
      link: chunk.link,
    })

    for (const char of Array.from(chunk.text)) {
      characters.push({ char, style })
    }
  }

  return characters
}

function fromCharacters(characters: CharacterToken[]): StyledText {
  if (characters.length === 0) {
    return new StyledText([])
  }

  const chunks: TextChunkLike[] = []
  let currentText = ""
  let currentStyle = cloneStyle(characters[0]!.style)

  for (const token of characters) {
    if (currentText.length > 0 && !styleEquals(currentStyle, token.style)) {
      chunks.push(createChunk(currentText, currentStyle))
      currentText = ""
      currentStyle = cloneStyle(token.style)
    }

    currentText += token.char
  }

  if (currentText.length > 0) {
    chunks.push(createChunk(currentText, currentStyle))
  }

  return new StyledText(chunks)
}

function splitLines(styledText: StyledText): StyledText[] {
  const lines: CharacterToken[][] = [[]]

  for (const token of toCharacters(styledText)) {
    if (token.char === "\n") {
      lines.push([])
      continue
    }

    lines[lines.length - 1]!.push(token)
  }

  return lines.map((line) => fromCharacters(line))
}

function joinLines(lines: StyledText[]): StyledText {
  const chunks: TextChunkLike[] = []

  lines.forEach((line, index) => {
    chunks.push(...(line.chunks as TextChunkLike[]))

    if (index < lines.length - 1) {
      chunks.push(createChunk("\n", { attributes: TextAttributes.NONE }))
    }
  })

  return new StyledText(chunks)
}

function mapTextOntoStyles(nextText: string, original: CharacterToken[]): StyledText {
  const characters = Array.from(nextText).map((char, index) => ({
    char,
    style:
      original[index]?.style ??
      original[original.length - 1]?.style ?? {
        attributes: TextAttributes.NONE,
      },
  }))

  return fromCharacters(characters)
}

function unsupportedTextNode(strict: boolean | undefined): StyledText {
  if (strict !== false) {
    throw new Error("open-ink Transform only supports textual descendants.")
  }

  return new StyledText([])
}

export function createBaseTextStyle(props: Pick<TextNodeOptions, "fg" | "bg" | "attributes">): ChunkStyle {
  return {
    fg: props.fg ? parseColor(props.fg) : undefined,
    bg: props.bg ? parseColor(props.bg) : undefined,
    attributes: props.attributes ?? TextAttributes.NONE,
  }
}

export function flattenTextToStyledText(
  node: ReactNode,
  baseStyle: ChunkStyle = { attributes: TextAttributes.NONE },
  options: FlattenOptions = {},
): StyledText {
  if (node == null || typeof node === "boolean") {
    return new StyledText([])
  }

  if (typeof node === "string" || typeof node === "number") {
    return new StyledText([createChunk(String(node), baseStyle)])
  }

  if (Array.isArray(node)) {
    const chunks: TextChunkLike[] = []
    for (const child of node) {
      chunks.push(...(flattenTextToStyledText(child, baseStyle, options).chunks as TextChunkLike[]))
    }
    return new StyledText(chunks)
  }

  if (!React.isValidElement(node)) {
    return unsupportedTextNode(options.strict)
  }

  const element = node as React.ReactElement<any>

  if (element.type === React.Fragment) {
    return flattenTextToStyledText(element.props.children, baseStyle, options)
  }

  if ((element.type as any)?.[OPEN_INK_NEWLINE]) {
    return new StyledText([createChunk("\n".repeat(element.props.count ?? 1), baseStyle)])
  }

  if ((element.type as any)?.[OPEN_INK_TEXT]) {
    const nextStyle = normalizeTextStyle(baseStyle, element.props)
    return flattenTextToStyledText(element.props.children, nextStyle, options)
  }

  if (typeof element.type === "string" && (element.type === "span" || element.type === "a")) {
    const nextStyle = normalizeTextStyle(baseStyle, element.props)
    return flattenTextToStyledText(element.props.children, nextStyle, options)
  }

  return unsupportedTextNode(options.strict)
}

export function flattenTextToString(node: ReactNode): string {
  return (flattenTextToStyledText(node, { attributes: TextAttributes.NONE }, { strict: false }).chunks as TextChunkLike[])
    .map((chunk) => chunk.text)
    .join("")
}

export function transformStyledText(
  styledText: StyledText,
  transform: (outputLine: string, index: number) => string,
): StyledText {
  const transformedLines = splitLines(styledText).map((line, index) => {
    const original = toCharacters(line)
    const plain = original.map((token) => token.char).join("")
    return mapTextOntoStyles(transform(plain, index), original)
  })

  return joinLines(transformedLines)
}

export function truncateStyledText(
  styledText: StyledText,
  width: number,
  mode: "truncate-start" | "truncate-middle" | "truncate-end" | "truncate",
): StyledText {
  if (width <= 0) {
    return new StyledText([])
  }

  const firstLine = splitLines(styledText)[0] ?? new StyledText([])
  const characters = toCharacters(firstLine)

  if (characters.length <= width) {
    return firstLine
  }

  if (width === 1) {
    return mapTextOntoStyles("…", characters)
  }

  const visible = width - 1
  let nextCharacters: CharacterToken[]

  switch (mode) {
    case "truncate-start":
      nextCharacters = [{ char: "…", style: characters[0]!.style }, ...characters.slice(characters.length - visible)]
      break
    case "truncate-middle": {
      const leftCount = Math.ceil(visible / 2)
      const rightCount = Math.floor(visible / 2)
      nextCharacters = [
        ...characters.slice(0, leftCount),
        { char: "…", style: characters[leftCount - 1]?.style ?? characters[0]!.style },
        ...characters.slice(characters.length - rightCount),
      ]
      break
    }
    case "truncate":
    case "truncate-end":
    default:
      nextCharacters = [...characters.slice(0, visible), { char: "…", style: characters[visible - 1]!.style }]
      break
  }

  return fromCharacters(nextCharacters)
}

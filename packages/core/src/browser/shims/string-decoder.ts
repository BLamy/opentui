// Renderer stdout can split a UTF-8 character between writes. TextDecoder's
// streaming mode preserves those bytes until the next write or explicit end.
export class StringDecoder {
  private readonly decoder: TextDecoder

  constructor(encoding = "utf8") {
    const normalized = encoding.toLowerCase().replace(/[-_]/g, "")
    if (normalized !== "utf8" && normalized !== "utf16le" && normalized !== "ucs2") {
      throw new RangeError(`Unsupported browser StringDecoder encoding: ${encoding}`)
    }
    this.decoder = new TextDecoder(normalized === "utf8" ? "utf-8" : "utf-16le", { ignoreBOM: true })
  }

  write(bytes: Uint8Array): string {
    return this.decoder.decode(bytes, { stream: true })
  }

  end(bytes?: Uint8Array): string {
    return (bytes ? this.write(bytes) : "") + this.decoder.decode()
  }
}

export default { StringDecoder }

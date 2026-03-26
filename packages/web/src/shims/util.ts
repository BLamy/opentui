export function format(...args: unknown[]): string {
  return args
    .map((value) => {
      if (typeof value === "string") {
        return value
      }

      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    })
    .join(" ")
}

const util = {
  format,
}

export default util

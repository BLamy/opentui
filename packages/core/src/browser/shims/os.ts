export function homedir(): string {
  return "/"
}

export function tmpdir(): string {
  return "/tmp"
}

export function platform(): string {
  return "browser"
}

export const EOL = "\n"

export default { EOL, homedir, platform, tmpdir }

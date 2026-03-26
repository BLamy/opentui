export interface ConsoleOptions {
  stdout?: { write?(value: string): void }
  stderr?: { write?(value: string): void }
}

export class Console {
  private readonly stdout
  private readonly stderr

  constructor(options: ConsoleOptions = {}) {
    this.stdout = options.stdout
    this.stderr = options.stderr
  }

  public log(...args: any[]): void {
    this.stdout?.write?.(args.map(String).join(" "))
  }

  public info(...args: any[]): void {
    this.log(...args)
  }

  public warn(...args: any[]): void {
    this.stderr?.write?.(args.map(String).join(" "))
  }

  public error(...args: any[]): void {
    this.warn(...args)
  }

  public debug(...args: any[]): void {
    this.warn(...args)
  }
}

const consoleShim = {
  Console,
}

export default consoleShim

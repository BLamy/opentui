export function createRequire(): (specifier: string) => never {
  return (specifier) => {
    throw new Error(`require(${JSON.stringify(specifier)}) is not available in the browser`)
  }
}

export const builtinModules: string[] = []

export default { builtinModules, createRequire }

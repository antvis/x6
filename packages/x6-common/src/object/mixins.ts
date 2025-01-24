/**
 * 对象属性混入mixins
 * @see https://www.typescriptlang.org/docs/handbook/mixins.html
 */
export function applyMixins(derivedCtor: any, ...baseCtors: any[]) {
  baseCtors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      if (name !== 'constructor') {
        Object.defineProperty(
          derivedCtor.prototype,
          name,
          Object.getOwnPropertyDescriptor(baseCtor.prototype, name)!,
        )
      }
    })
  })
}

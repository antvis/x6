import { ObjectExt, KeyValue, Timing, Interp } from '@antv/x6-common'
import { Cell } from './cell'

export class Animation {
  protected readonly ids: { [path: string]: number } = {}
  protected readonly cache: {
    [path: string]: {
      startValue: any
      targetValue: any
      options: Animation.StartOptions<any>
    }
  } = {}

  constructor(protected readonly cell: Cell) {}

  get() {
    return Object.keys(this.ids)
  }

  start<T extends Animation.TargetValue>(
    path: string | string[],
    targetValue: T,
    options: Animation.StartOptions<T> = {},
    delim = '/',
  ): () => void {
    const startValue = this.cell.getPropByPath<T>(path)
    const localOptions = ObjectExt.defaults(options, Animation.defaultOptions)
    const timing = this.getTiming(localOptions.timing)
    const interpolate = this.getInterp<T>(
      localOptions.interp,
      startValue,
      targetValue,
    )

    let startTime = 0
    const key = Array.isArray(path) ? path.join(delim) : path
    const paths = Array.isArray(path) ? path : path.split(delim)
    const iterate = () => {
      const now = new Date().getTime()
      if (startTime === 0) {
        startTime = now
      }

      const elaspe = now - startTime
      let progress = elaspe / localOptions.duration
      if (progress < 1) {
        this.ids[key] = requestAnimationFrame(iterate)
      } else {
        progress = 1
      }

      const currentValue = interpolate(timing(progress)) as T
      this.cell.setPropByPath(paths, currentValue)

      if (options.progress) {
        options.progress({ progress, currentValue, ...this.getArgs<T>(key) })
      }

      if (progress === 1) {
        this.cell.notify('transition:complete', this.getArgs<T>(key))
        options.complete && options.complete(this.getArgs<T>(key))

        this.cell.notify('transition:finish', this.getArgs<T>(key))
        options.finish && options.finish(this.getArgs<T>(key))
        this.clean(key)
      }
    }

    setTimeout(() => {
      this.stop(path, undefined, delim)
      this.cache[key] = { startValue, targetValue, options: localOptions }
      this.ids[key] = requestAnimationFrame(iterate)

      this.cell.notify('transition:start', this.getArgs<T>(key))
      options.start && options.start(this.getArgs<T>(key))
    }, options.delay)

    return this.stop.bind(this, path, options,delim)
  }

  stop<T extends Animation.TargetValue>(
    path: string | string[],
    options: Animation.StopOptions<T> = {},
    delim = '/',
  ) {
    const paths = Array.isArray(path) ? path : path.split(delim)
    Object.keys(this.ids)
      .filter((key) =>
        ObjectExt.isEqual(paths, key.split(delim).slice(0, paths.length)),
      )
      .forEach((key) => {
        cancelAnimationFrame(this.ids[key])
        const data = this.cache[key]
        const commonArgs = this.getArgs<T>(key)
        const localOptions = { ...data.options, ...options }
        const jumpedToEnd = localOptions.jumpedToEnd
        if (jumpedToEnd && data.targetValue != null) {
          this.cell.setPropByPath(key, data.targetValue)

          this.cell.notify('transition:end', { ...commonArgs })
          this.cell.notify('transition:complete', { ...commonArgs })
          localOptions.complete && localOptions.complete({ ...commonArgs })
        }

        const stopArgs = { jumpedToEnd, ...commonArgs }
        this.cell.notify('transition:stop', { ...stopArgs })
        localOptions.stop && localOptions.stop({ ...stopArgs })

        this.cell.notify('transition:finish', { ...commonArgs })
        localOptions.finish && localOptions.finish({ ...commonArgs })

        this.clean(key)
      })

    return this
  }

  private clean(key: string) {
    delete this.ids[key]
    delete this.cache[key]
  }

  private getTiming(timing: Timing.Names | Timing.Definition) {
    return typeof timing === 'string' ? Timing[timing] : timing
  }

  private getInterp<T extends Animation.TargetValue>(
    interp: Interp.Definition<any> | undefined,
    startValue: T,
    targetValue: T,
  ) {
    if (interp) {
      return interp(startValue, targetValue)
    }

    if (typeof targetValue === 'number') {
      return Interp.number(startValue as number, targetValue)
    }

    if (typeof targetValue === 'string') {
      if (targetValue[0] === '#') {
        return Interp.color(startValue as string, targetValue)
      }

      return Interp.unit(startValue as string, targetValue)
    }

    return Interp.object(
      startValue as KeyValue<number>,
      targetValue as KeyValue<number>,
    )
  }

  private getArgs<T extends Animation.TargetValue>(
    key: string,
  ): Animation.CallbackArgs<T> {
    const data = this.cache[key]
    return {
      path: key,
      startValue: data.startValue,
      targetValue: data.targetValue,
      cell: this.cell,
    }
  }
}

export namespace Animation {
  export interface BaseOptions {
    delay: number
    duration: number
    timing: Timing.Names | Timing.Definition
  }

  export type TargetValue = string | number | KeyValue<number>

  export interface CallbackArgs<T> {
    cell: Cell
    path: string
    startValue: T
    targetValue: T
  }

  export interface ProgressArgs<T> extends CallbackArgs<T> {
    progress: number
    currentValue: T
  }

  export interface StopArgs<T> extends CallbackArgs<T> {
    jumpedToEnd?: boolean
  }

  export interface StartOptions<T>
    extends Partial<BaseOptions>,
      StopOptions<T> {
    interp?: Interp.Definition<any>
    /**
     * A function to call when the animation begins.
     */
    start?: (options: CallbackArgs<T>) => void
    /**
     * A function to be called after each step of the animation, only once per
     * animated element regardless of the number of animated properties.
     */
    progress?: (options: ProgressArgs<T>) => void
  }

  export interface StopOptions<T> {
    /**
     * A Boolean indicating whether to complete the animation immediately.
     * Defaults to `false`.
     */
    jumpedToEnd?: boolean
    /**
     * A function that is called once the animation completes.
     */
    complete?: (options: CallbackArgs<T>) => void
    /**
     * A function to be called when the animation stops.
     */
    stop?: (options: StopArgs<T>) => void
    /**
     * A function to be called when the animation completes or stops.
     */
    finish?: (options: CallbackArgs<T>) => void
  }

  export const defaultOptions: BaseOptions = {
    delay: 10,
    duration: 100,
    timing: 'linear',
  }
}

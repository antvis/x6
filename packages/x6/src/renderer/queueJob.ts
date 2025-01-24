export class JobQueue {
  private isFlushing = false
  private isFlushPending = false
  private scheduleId = 0
  private queue: Job[] = []
  private frameInterval = 33
  private initialTime = Date.now()

  queueJob(job: Job) {
    if (job.priority & JOB_PRIORITY.PRIOR) {
      job.cb()
    } else {
      const index = this.findInsertionIndex(job)
      if (index >= 0) {
        this.queue.splice(index, 0, job)
      }
    }
  }

  queueFlush() {
    if (!this.isFlushing && !this.isFlushPending) {
      this.isFlushPending = true
      this.scheduleJob()
    }
  }

  queueFlushSync() {
    if (!this.isFlushing && !this.isFlushPending) {
      this.isFlushPending = true
      this.flushJobsSync()
    }
  }

  clearJobs() {
    this.queue.length = 0
    this.isFlushing = false
    this.isFlushPending = false
    this.cancelScheduleJob()
  }

  flushJobs() {
    this.isFlushPending = false
    this.isFlushing = true

    const startTime = this.getCurrentTime()

    let job
    while ((job = this.queue.shift())) {
      job.cb()
      if (this.getCurrentTime() - startTime >= this.frameInterval) {
        break
      }
    }

    this.isFlushing = false

    if (this.queue.length) {
      this.queueFlush()
    }
  }
  /**
   * 同步刷新执行任务队列
   */
  flushJobsSync() {
    this.isFlushPending = false
    this.isFlushing = true

    let job
    while ((job = this.queue.shift())) {
      try {
        job.cb()
      } catch (error) {
        // eslint-disable-next-line
        console.log(error)
      }
    }

    this.isFlushing = false
  }

  /**
   * 二分法查找任务插入的位置，优先级高的排列在前
   * @param job 
   * @returns 
   */
  private findInsertionIndex(job: Job) {
    let left = 0
    let ins = this.queue.length
    let right = ins - 1
    const priority = job.priority
    while (left <= right) {
      const mid = ((right - left) >> 1) + left
      if (priority <= this.queue[mid].priority) {
        left = mid + 1
      } else {
        ins = mid
        right = mid - 1
      }
    }
    return ins
  }
  /**
   * 异步任务调度，使用requestIdleCallback/setTimeout实现
   */
  private scheduleJob() {
    if ('requestIdleCallback' in window) {
      if (this.scheduleId) {
        this.cancelScheduleJob()
      }
      this.scheduleId = window.requestIdleCallback(this.flushJobs.bind(this), {
        timeout: 100,
      })
    } else {
      if (this.scheduleId) {
        this.cancelScheduleJob()
      }
      this.scheduleId = (window as Window).setTimeout(this.flushJobs.bind(this))
    }
  }

  private cancelScheduleJob() {
    if ('cancelIdleCallback' in window) {
      if (this.scheduleId) {
        window.cancelIdleCallback(this.scheduleId)
      }
      this.scheduleId = 0
    } else {
      if (this.scheduleId) {
        clearTimeout(this.scheduleId)
      }
      this.scheduleId = 0
    }
  }

  private getCurrentTime() {
    const hasPerformanceNow =
      typeof performance === 'object' && typeof performance.now === 'function'
    if (hasPerformanceNow) {
      return performance.now()
    }
    return Date.now() - this.initialTime
  }
}

export interface Job {
  id: string
  priority: JOB_PRIORITY
  cb: () => void
}

export enum JOB_PRIORITY {
  Update = /*    */ 1 << 1,
  RenderEdge = /**/ 1 << 2,
  RenderNode = /**/ 1 << 3,
  PRIOR = /*     */ 1 << 20,
}

// function findInsertionIndex(job: Job) {
//   let start = 0
//   for (let i = 0, len = queue.length; i < len; i += 1) {
//     const j = queue[i]
//     if (j.id === job.id) {
//       console.log('xx', j.bit, job.bit)
//     }
//     if (j.id === job.id && (job.bit ^ (job.bit & j.bit)) === 0) {
//       return -1
//     }
//     if (j.priority <= job.priority) {
//       start += 1
//     }
//   }
//   return start
// }

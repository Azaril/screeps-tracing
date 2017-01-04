interface TraceEvent {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  pid: number;
  tid: number;
  args?: { [id: string]: any };
}

interface TraceReport {
  traceEvents: TraceEvent[];
}

interface ProfilerMemory {
  started: boolean;
  completed: boolean;
  longTickRatio?: number;
  panicTickRatio?: number;
  traceEvents: TraceEvent[];
}

class Profiler {
  private memory: ProfilerMemory;

  private enabledCount: number;
  private disabledCount: number;

  private reportAtEnd: boolean;

  private paniced: boolean;

  public set panicTickRatio(value: number | undefined) {
    this.memory.panicTickRatio = value;
  }

  public get panicTickRatio(): number | undefined {
    return this.memory.panicTickRatio;
  }

  public set longTickRatio(value: number | undefined) {
    this.memory.longTickRatio = value;
  }

  public get longTickRatio(): number | undefined {
    return this.memory.longTickRatio;
  }

  constructor(memory: ProfilerMemory) {
    this.memory = memory;

    this.enabledCount = 0;
    this.disabledCount = 0;

    this.reportAtEnd = false;

    this.paniced = false;
  }

  public enabled() {
    return !this.paniced && this.enabledCount > 0 && this.disabledCount === 0;
  }

  public pushEnabled() {
    this.enabledCount = this.enabledCount + 1;
  }

  public popEnabled() {
    this.enabledCount = this.enabledCount - 1;
  }

  public beginEvent(name: string, timestamp: number) {
    let event: TraceEvent = {
      name: name,
      cat: "Function",
      ph: "B",
      ts: timestamp * 1000,
      pid: 0,
      tid: 0,
    };

    this.memory.traceEvents.push(event);
  }

  public endEvent(name: string, timestamp: number) {
    let event: TraceEvent = {
      name: name,
      cat: "Function",
      ph: "E",
      ts: timestamp * 1000,
      pid: 0,
      tid: 0,
    };

    this.memory.traceEvents.push(event);
  }

  public beginTrace() {
    this.enabledCount = 0;
    this.disabledCount = 0;

    this.memory.started = true;
    this.memory.completed = false;
    this.memory.traceEvents = [];

    this.pushEnabled();

    this.beginEvent("Frame", Game.cpu.getUsed());
  }

  public report() {
    this.reportAtEnd = true;
  }

  public endTrace() {
    this.endEvent("Frame", Game.cpu.getUsed());

    this.popEnabled();

    this.paniced = false;

    this.memory.started = false;
    this.memory.completed = false;

    let longTickRatio = this.longTickRatio;

    let exceededLimit = longTickRatio !== undefined
      ? (Game.cpu.getUsed() >= (Game.cpu.limit * longTickRatio))
      : false;

    if (this.reportAtEnd || exceededLimit) {
      this.reportAtEnd = false;

      if (exceededLimit) {
        console.log("Exceeded normal tick limit - dumping trace.");
      }

      this.flushReport();
    }
  }

  public panicFlush() {
    console.log("Panic flushing");

    if (!this.paniced) {
      this.paniced = true;

      this.flushReport();
    }
  }

  private flushReport() {
    let traceReport: TraceReport = {
      traceEvents: this.memory.traceEvents,
    };

    let data = JSON.stringify(traceReport);

    console.log(data);
  }
}

if (!(Memory as any).profiler) {
  (Memory as any).profiler = {};
}

let profilerInstance = new Profiler((Memory as any).profiler);

function wrapFunction(name: string, originalFunction: Function) {
  return function wrappedFunction() {
    if (profilerInstance.enabled()) {
      const start = Game.cpu.getUsed();
      if (profilerInstance.panicTickRatio !== undefined && (start >= Game.cpu.tickLimit * profilerInstance.panicTickRatio)) {
        profilerInstance.panicFlush();
      }
      profilerInstance.beginEvent(name, start);
      const result = originalFunction.apply(this, arguments);
      const end = Game.cpu.getUsed();
      profilerInstance.endEvent(name, end);
      return result;
    } else {
      return originalFunction.apply(this, arguments);
    }
  };
}

export function Tick(func: () => void) {
  overloadCPUCalc();

  (Game as any).profiler = profilerInstance;

  profilerInstance.beginTrace();

  func();

  profilerInstance.endTrace();
}

let usedOnStart = 0;

function overloadCPUCalc() {
  if ((Game.rooms as any).sim) {
    usedOnStart = 0;
    Game.cpu.getUsed = function getUsed() {
      return performance.now() - usedOnStart;
    };
  }
}

const functionBlackList = [
  "getUsed",
  "tickLimit",
  "constructor",
];

function profileFunction(fn: Function, functionName: string) {
  const fnName = functionName || fn.name;
  if (!fnName) {
    console.log("Couldn\'t find a function name for - ", fn);
    console.log("Will not profile this function.");
    return fn;
  }

  return wrapFunction(fnName, fn);
}

export function profileObjectFunctions(object: any, label: string) {
  const objectToWrap = object.prototype ? object.prototype : object;

  Object.getOwnPropertyNames(objectToWrap).forEach(functionName => {
    const extendedLabel = `${label}.${functionName}`;

    const isBlackListed = functionBlackList.indexOf(functionName) !== -1;
    if (isBlackListed) {
      return;
    }

    let descriptor = Object.getOwnPropertyDescriptor(objectToWrap, functionName);
    if (!descriptor) {
      return;
    }

    const hasAccessor = descriptor.get || descriptor.set;
    if (hasAccessor) {
      const configurable = descriptor.configurable;
      if (!configurable) {
        return;
      }

      const profileDescriptor: PropertyDescriptor = {};

      if (descriptor.get) {
        const extendedLabelGet = `${extendedLabel}:get`;
        profileDescriptor.get = profileFunction(descriptor.get, extendedLabelGet) as () => any;
      }

      if (descriptor.set) {
        const extendedLabelSet = `${extendedLabel}:set`;
        profileDescriptor.set = profileFunction(descriptor.set, extendedLabelSet) as (v: any) => void;
      }

      Object.defineProperty(objectToWrap, functionName, profileDescriptor);

      return;
    }

    const isFunction = typeof descriptor.value === "function";
    if (!isFunction) {
      return;
    }
    const originalFunction = objectToWrap[functionName];
    objectToWrap[functionName] = profileFunction(originalFunction, extendedLabel);
  });

  return objectToWrap;
}

export function registerClass(obj: any, name: string) {
  profileObjectFunctions(obj, name);
}

export function registerObject(obj: any, name: string) {
  profileObjectFunctions(obj, name);
}

export function Scope(name: string, func: () => void) {
  profilerInstance.beginEvent(name, Game.cpu.getUsed());

  func();

  profilerInstance.endEvent(name, Game.cpu.getUsed());
}

export function panic() {
  profilerInstance.panicFlush();
}

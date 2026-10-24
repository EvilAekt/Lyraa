/**
 * Soak Monitor & Resource Profiler
 * Implements PRD §5, §15 (Task T3.7), and TC-17:
 * - Records RSS, Heap Used, Heap Total, External Memory (MB) every minute
 * - Measures CPU usage (%) and event-loop lag (ms)
 * - Computes hourly memory growth rate (TC-17 mandate: < 10% per hour)
 * - Detects memory leaks and unhandled crash events
 */

export interface MetricSnapshot {
  timestamp: Date;
  minute: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  cpuPercent: number;
  eventLoopLagMs: number;
  turnsCompleted: number;
  turnErrors: number;
}

export interface SoakReportSummary {
  durationMinutes: number;
  totalTurns: number;
  failedTurns: number;
  initialRssMb: number;
  finalRssMb: number;
  peakRssMb: number;
  initialHeapMb: number;
  finalHeapMb: number;
  peakHeapMb: number;
  averageCpuPercent: number;
  peakCpuPercent: number;
  averageEventLoopLagMs: number;
  maxEventLoopLagMs: number;
  hourlyGrowthPercent: number;
  hasCrashed: boolean;
  isTc17Compliant: boolean; // growth < 10%/hour and no crashes
}

export class SoakMonitor {
  private snapshots: MetricSnapshot[] = [];
  private lastCpuUsage: NodeJS.CpuUsage;
  private lastCpuTime: number;
  private turnsCompleted = 0;
  private turnErrors = 0;
  private hasCrashed = false;
  private startTime: number;

  constructor() {
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = Date.now();
    this.startTime = Date.now();
  }

  /**
   * Records a synthetic speech turn completion.
   */
  public recordTurn(success = true) {
    if (success) {
      this.turnsCompleted++;
    } else {
      this.turnErrors++;
    }
  }

  /**
   * Records process crash or unhandled fatal error.
   */
  public recordCrash() {
    this.hasCrashed = true;
  }

  /**
   * Measures event-loop lag in milliseconds.
   */
  public async measureEventLoopLag(): Promise<number> {
    const start = Date.now();
    return new Promise<number>((resolve) => {
      setImmediate(() => {
        resolve(Math.max(0, Date.now() - start));
      });
    });
  }

  /**
   * Calculates CPU usage percentage since last measurement.
   */
  public calculateCpuPercent(): number {
    const currentCpu = process.cpuUsage(this.lastCpuUsage);
    const now = Date.now();
    const timeDeltaMs = Math.max(1, now - this.lastCpuTime);

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = now;

    // Convert microseconds to milliseconds and calculate percentage
    const totalCpuMs = (currentCpu.user + currentCpu.system) / 1000;
    const cpuPercent = (totalCpuMs / timeDeltaMs) * 100;
    return Math.min(100, Math.max(0, Math.round(cpuPercent * 10) / 10));
  }

  /**
   * Takes a point-in-time resource snapshot.
   */
  public async takeSnapshot(minute?: number): Promise<MetricSnapshot> {
    const mem = process.memoryUsage();
    const eventLoopLagMs = await this.measureEventLoopLag();
    const cpuPercent = this.calculateCpuPercent();

    const snapshotMinute = minute ?? Math.floor((Date.now() - this.startTime) / 60000);

    const snapshot: MetricSnapshot = {
      timestamp: new Date(),
      minute: snapshotMinute,
      rssMb: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
      heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
      heapTotalMb: Math.round((mem.heapTotal / (1024 * 1024)) * 100) / 100,
      externalMb: Math.round((mem.external / (1024 * 1024)) * 100) / 100,
      cpuPercent,
      eventLoopLagMs,
      turnsCompleted: this.turnsCompleted,
      turnErrors: this.turnErrors,
    };

    this.snapshots.push(snapshot);
    return snapshot;
  }

  public getSnapshots(): MetricSnapshot[] {
    return this.snapshots;
  }

  /**
   * Computes comprehensive soak evaluation and verifies TC-17 criteria.
   */
  public generateSummary(durationMinutes?: number): SoakReportSummary {
    const effectiveDuration = durationMinutes ?? Math.max(1, Math.floor((Date.now() - this.startTime) / 60000));
    const hoursElapsed = Math.max(0.01, effectiveDuration / 60);

    if (this.snapshots.length === 0) {
      const mem = process.memoryUsage();
      const currentRss = mem.rss / (1024 * 1024);
      return {
        durationMinutes: effectiveDuration,
        totalTurns: this.turnsCompleted,
        failedTurns: this.turnErrors,
        initialRssMb: currentRss,
        finalRssMb: currentRss,
        peakRssMb: currentRss,
        initialHeapMb: mem.heapUsed / (1024 * 1024),
        finalHeapMb: mem.heapUsed / (1024 * 1024),
        peakHeapMb: mem.heapUsed / (1024 * 1024),
        averageCpuPercent: 0,
        peakCpuPercent: 0,
        averageEventLoopLagMs: 0,
        maxEventLoopLagMs: 0,
        hourlyGrowthPercent: 0,
        hasCrashed: this.hasCrashed,
        isTc17Compliant: !this.hasCrashed,
      };
    }

    const initial = this.snapshots[0];
    const final = this.snapshots[this.snapshots.length - 1];

    const rssValues = this.snapshots.map((s) => s.rssMb);
    const heapValues = this.snapshots.map((s) => s.heapUsedMb);
    const cpuValues = this.snapshots.map((s) => s.cpuPercent);
    const lagValues = this.snapshots.map((s) => s.eventLoopLagMs);

    const peakRssMb = Math.max(...rssValues);
    const peakHeapMb = Math.max(...heapValues);
    const peakCpuPercent = Math.max(...cpuValues);
    const maxEventLoopLagMs = Math.max(...lagValues);

    const averageCpuPercent =
      Math.round((cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length) * 10) / 10;
    const averageEventLoopLagMs =
      Math.round((lagValues.reduce((a, b) => a + b, 0) / lagValues.length) * 10) / 10;

    // Calculate hourly memory growth rate: ((final - initial) / initial) / hours * 100%
    const totalGrowthPercent = ((final.rssMb - initial.rssMb) / initial.rssMb) * 100;
    const hourlyGrowthPercent =
      Math.round((totalGrowthPercent / hoursElapsed) * 100) / 100;

    // TC-17 requirement: growth < 10% per hour and no crashes
    const isTc17Compliant = !this.hasCrashed && hourlyGrowthPercent < 10.0;

    return {
      durationMinutes: effectiveDuration,
      totalTurns: this.turnsCompleted,
      failedTurns: this.turnErrors,
      initialRssMb: initial.rssMb,
      finalRssMb: final.rssMb,
      peakRssMb,
      initialHeapMb: initial.heapUsedMb,
      finalHeapMb: final.heapUsedMb,
      peakHeapMb,
      averageCpuPercent,
      peakCpuPercent,
      averageEventLoopLagMs,
      maxEventLoopLagMs,
      hourlyGrowthPercent,
      hasCrashed: this.hasCrashed,
      isTc17Compliant,
    };
  }

  /**
   * Resets recorder state.
   */
  public reset() {
    this.snapshots = [];
    this.turnsCompleted = 0;
    this.turnErrors = 0;
    this.hasCrashed = false;
    this.startTime = Date.now();
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = Date.now();
  }
}

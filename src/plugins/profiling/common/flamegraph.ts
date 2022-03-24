/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import { Logger } from 'kibana/server';
import {
  buildCallerCalleeIntermediateRoot,
  CallerCalleeNode,
  fromCallerCalleeIntermediateNode,
} from './callercallee';
import {
  StackTraceID,
  StackFrameID,
  FileID,
  StackTrace,
  StackFrame,
  Executable,
  buildStackFrameMetadata,
  StackFrameMetadata,
} from './profiling';

interface PixiFlameGraph extends CallerCalleeNode {
  TotalTraces: number;
  TotalSeconds: number;
}

function checkIfStringHasParentheses(s: string) {
  return /\(|\)/.test(s);
}

function getFunctionName(frame: any) {
  return frame.FunctionName !== '' && !checkIfStringHasParentheses(frame.FunctionName)
    ? `${frame.FunctionName}()`
    : frame.FunctionName;
}

export class FlameGraph {
  // sampleRate is 1/5^N, with N being the downsampled index the events were fetched from.
  // N=0: full events table (sampleRate is 1)
  // N=1: downsampled by 5 (sampleRate is 0.2)
  // ...
  sampleRate: number;

  // totalCount is the sum(Count) of all events in the filter range in the
  // downsampled index we were looking at.
  // To estimate how many events we have in the full events index: totalCount / sampleRate.
  // Do the same for single entries in the events array.
  totalCount: number;

  events: Map<StackTraceID, number>;
  stacktraces: Map<StackTraceID, StackTrace>;
  stackframes: Map<StackFrameID, StackFrame>;
  executables: Map<FileID, Executable>;

  private readonly logger: Logger;

  constructor(
    sampleRate: number,
    totalCount: number,
    events: Map<StackTraceID, number>,
    stackTraces: Map<StackTraceID, StackTrace>,
    stackFrames: Map<StackFrameID, StackFrame>,
    executables: Map<FileID, Executable>,
    logger: Logger
  ) {
    this.sampleRate = sampleRate;
    this.totalCount = totalCount;
    this.events = events;
    this.stacktraces = stackTraces;
    this.stackframes = stackFrames;
    this.executables = executables;
    this.logger = logger;
  }

  private getExeFileName(exe: any, type: number) {
    if (exe?.FileName === undefined) {
      this.logger.warn('missing executable FileName');
      return '';
    }
    if (exe.FileName !== '') {
      return exe.FileName;
    }
    switch (type) {
      case 0:
        return '<unsymbolized frame>';
      case 1:
        return 'Python';
      case 2:
        return 'PHP';
      case 3:
        return 'Native';
      case 4:
        return 'Kernel';
      case 5:
        return 'JVM/Hotspot';
      case 6:
        return 'Ruby';
      case 7:
        return 'Perl';
      case 8:
        return 'JavaScript';
      default:
        return '';
    }
  }

  // Generates the label for a flamegraph node
  //
  // This is slightly modified from the original code in elastic/prodfiler_ui
  private getLabel(frame: any, executable: any, type: number) {
    if (frame.FunctionName !== '') {
      return `${this.getExeFileName(executable, type)}: ${getFunctionName(frame)} in #${
        frame.LineNumber
      }`;
    }
    return this.getExeFileName(executable, type);
  }

  toElastic() {
    const leaves = [];
    let n = 0;

    for (const trace of this.stacktraces.values()) {
      const path = ['root'];
      for (let i = 0; i < trace.FrameID.length; i++) {
        const label = this.getLabel(
          this.stackframes.get(trace.FrameID[i]),
          this.executables.get(trace.FileID[i]),
          parseInt(trace.Type[i], 10)
        );

        if (label.length === 0) {
          path.push(trace.FrameID[i]);
        } else {
          path.push(label);
        }
      }
      const leaf = {
        id: path[0],
        value: 1,
        depth: trace.FrameID.length,
        pathFromRoot: Object.fromEntries(path.map((item, i) => [i, item])),
      };
      leaves.push(leaf);

      n++;
      if (n >= 1000) {
        // just don't overload the Kibana flamechart
        break;
      }
    }

    return { leaves };
  }

  toPixi(): PixiFlameGraph {
    let rootFrame = buildStackFrameMetadata();
    let metadataForTraces = new Map<StackTraceID, StackFrameMetadata[]>();
    let diagram = buildCallerCalleeIntermediateRoot(rootFrame, this.events, metadataForTraces);
    return {
      ...fromCallerCalleeIntermediateNode(diagram),
      TotalTraces: this.totalCount,
      TotalSeconds: 0,
    } as PixiFlameGraph;
  }
}

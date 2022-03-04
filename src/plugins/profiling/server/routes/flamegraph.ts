/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import { StackTraceID, StackFrameID, FileID, StackTrace, StackFrame, Executable } from './types';

function getExeFileName(exe: any, type: number) {
  if (exe?.FileName === undefined) {
    console.log('MISSING EXE');
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

function checkIfStringHasParentheses(s: string) {
  return /\(|\)/.test(s);
}

function getFunctionName(frame: any) {
  return frame.FunctionName !== '' && !checkIfStringHasParentheses(frame.FunctionName)
    ? `${frame.FunctionName}()`
    : frame.FunctionName;
}

// Generates the label for a flamegraph node
//
// This is slightly modified from the original code in elastic/prodfiler_ui
function getLabel(frame: any, executable: any, type: number) {
  if (frame.FunctionName !== '') {
    return `${getExeFileName(executable, type)}: ${getFunctionName(frame)} in #${frame.LineNumber}`;
  }
  return getExeFileName(executable, type);
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

  constructor(
    sampleRate: number,
    totalCount: number,
    events: Map<StackTraceID, number>,
    stackTraces: Map<StackTraceID, StackTrace>,
    stackFrames: Map<StackFrameID, StackFrame>,
    executables: Map<FileID, Executable>
  ) {
    this.sampleRate = sampleRate;
    this.totalCount = totalCount;
    this.events = events;
    this.stacktraces = stackTraces;
    this.stackframes = stackFrames;
    this.executables = executables;
  }

  toElastic() {
    const leaves = [];
    let n = 0;

    for (const trace of this.stacktraces.values()) {
      const path = ['root'];
      for (let i = trace.FrameID.length - 1; i >= 0; i--) {
        const label = getLabel(
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
        id: path[path.length - 1],
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

  toPixi() {
    return {};
  }
}

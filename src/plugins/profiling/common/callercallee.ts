/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { override } from '.';
import {
  compareFrameGroup,
  defaultGroupBy,
  FrameGroup,
  FrameGroupID,
  hashFrameGroup,
  StackFrameMetadata,
  StackTraceID,
} from './profiling';

export interface CallerCalleeIntermediateNode {
  frameGroup: FrameGroup;
  callers: Map<FrameGroupID, CallerCalleeIntermediateNode>;
  callees: Map<FrameGroupID, CallerCalleeIntermediateNode>;
  frameMetadata: Set<StackFrameMetadata>;
  samples: number;
}

export function buildCallerCalleeIntermediateNode(
  frameMetadata: StackFrameMetadata,
  samples: number
): CallerCalleeIntermediateNode {
  return {
    frameGroup: defaultGroupBy(frameMetadata),
    callers: new Map<FrameGroupID, CallerCalleeIntermediateNode>(),
    callees: new Map<FrameGroupID, CallerCalleeIntermediateNode>(),
    frameMetadata: new Set<StackFrameMetadata>([frameMetadata]),
    samples: samples,
  };
}

interface relevantTrace {
  frames: StackFrameMetadata[];
  index: number;
}

// selectRelevantTraces searches through a map that maps trace hashes to their
// frames and only returns those traces that have a frame that are equivalent
// to the rootFrame provided. It also sets the "index" in the sequence of
// traces at which the rootFrame is found.
//
// If the rootFrame is "empty" (e.g. fileID is empty and line number is 0), all
// traces in the given time frame are deemed relevant, and the "index" is set
// to the length of the trace -- since there is no root frame, the frame should
// be considered "calls-to" only going.
function selectRelevantTraces(
  rootFrame: StackFrameMetadata,
  frames: Map<StackTraceID, StackFrameMetadata[]>
): Map<StackTraceID, relevantTrace> {
  const result = new Map<StackTraceID, relevantTrace>();
  const rootString = hashFrameGroup(defaultGroupBy(rootFrame));
  for (const [stackTraceID, frameMetadata] of frames) {
    if (rootFrame.FileID === '' && rootFrame.AddressOrLine === 0) {
      // If the root frame is empty, every trace is relevant, and all elements
      // of the trace are relevant. This means that the index is set to the
      // length of the frameMetadata, implying that in the absence of a root
      // frame the "topmost" frame is the root frame.
      result.set(stackTraceID, {
        frames: frameMetadata,
        index: frameMetadata.length,
      } as relevantTrace);
    } else {
      // Search for the right index of the root frame in the frameMetadata, and
      // set it in the result.
      for (let i = 0; i < frameMetadata.length; i++) {
        if (rootString === hashFrameGroup(defaultGroupBy(frameMetadata[i]))) {
          result.set(stackTraceID, {
            frames: frameMetadata,
            index: i,
          } as relevantTrace);
        }
      }
    }
  }
  return result;
}

function sortRelevantTraces(relevantTraces: Map<StackTraceID, relevantTrace>): StackTraceID[] {
  const sortedRelevantTraces = new Array<StackTraceID>();
  for (const trace of relevantTraces.keys()) {
    sortedRelevantTraces.push(trace);
  }
  return sortedRelevantTraces.sort((t1, t2) => {
    if (t1 < t2) return -1;
    if (t1 > t2) return 1;
    return 0;
  });
}

// buildCallerCalleeIntermediateRoot builds a graph in the internal
// representation from a StackFrameMetadata that identifies the "centered"
// function and the trace results that provide traces and the number of times
// that the trace has been seen.
//
// The resulting data structure contains all of the data, but is not yet in the
// form most easily digestible by others.
export function buildCallerCalleeIntermediateRoot(
  rootFrame: StackFrameMetadata,
  traces: Map<StackTraceID, number>,
  frames: Map<StackTraceID, StackFrameMetadata[]>
): CallerCalleeIntermediateNode {
  // Create a node for the centered frame
  const root = buildCallerCalleeIntermediateNode(rootFrame, 0);

  // Obtain only the relevant frames (e.g. frames that contain the root frame
  // somewhere). If the root frame is "empty" (e.g. fileID is zero and line
  // number is zero), all frames are deemed relevant.
  const relevantTraces = selectRelevantTraces(rootFrame, frames);

  // For a deterministic result we have to walk the traces in a deterministic
  // order. A deterministic result allows for deterministic UI views, something
  // that users expect.
  const relevantTracesSorted = sortRelevantTraces(relevantTraces);

  // Walk through all traces that contain the root. Increment the count of the
  // root by the count of that trace. Walk "up" the trace (through the callers)
  // and add the count of the trace to each caller. Then walk "down" the trace
  // (through the callees) and add the count of the trace to each callee.
  for (const traceHash of relevantTracesSorted) {
    const trace = relevantTraces.get(traceHash)!;

    // The slice of frames is ordered so that the leaf function is at index 0.
    // This means that the "second part" of the slice are the callers, and the
    // "first part" are the callees.
    //
    // We currently assume there are no callers.
    const callees = trace.frames;
    const samples = traces.get(traceHash)!;

    // Go through the callees, reverse iteration
    let currentNode = root;
    for (let i = callees.length - 1; i >= 0; i--) {
      const callee = callees[i];
      const calleeName = hashFrameGroup(defaultGroupBy(callee));
      let node = currentNode.callees.get(calleeName);
      if (node === undefined) {
        node = buildCallerCalleeIntermediateNode(callee, samples);
        currentNode.callees.set(calleeName, node);
      } else {
        node.samples += samples;
      }
      currentNode = node;
    }
  }
  return root;
}

export interface CallerCalleeNode {
  Callers: CallerCalleeNode[];
  Callees: CallerCalleeNode[];

  FileID: string;
  FrameType: number;
  ExeFileName: string;
  FunctionID: string;
  FunctionName: string;
  AddressOrLine: number;
  FunctionSourceLine: number;

  // symbolization fields - currently unused
  FunctionSourceID: string;
  FunctionSourceURL: string;
  SourceFilename: string;
  SourceLine: number;

  Samples: number;
}

const defaultCallerCalleeNode: CallerCalleeNode = {
  Callers: [],
  Callees: [],
  FileID: '',
  FrameType: 0,
  ExeFileName: '',
  FunctionID: '',
  FunctionName: '',
  AddressOrLine: 0,
  FunctionSourceLine: 0,
  FunctionSourceID: '',
  FunctionSourceURL: '',
  SourceFilename: '',
  SourceLine: 0,
  Samples: 0,
};

export function buildCallerCalleeNode(node: Partial<CallerCalleeNode> = {}): CallerCalleeNode {
  return override(defaultCallerCalleeNode, node);
}

// selectCallerCalleeData is the "standard" way of merging multiple frames into
// one node. It simply takes the data from the first frame.
function selectCallerCalleeData(frameMetadata: Set<StackFrameMetadata>, node: CallerCalleeNode) {
  for (const metadata of frameMetadata) {
    node.ExeFileName = metadata.ExeFileName;
    node.FunctionID = metadata.FunctionName;
    node.FunctionName = metadata.FunctionName;
    node.FunctionSourceID = metadata.SourceID;
    node.FunctionSourceURL = metadata.SourceCodeURL;
    node.FunctionSourceLine = metadata.FunctionLine;
    node.SourceLine = metadata.SourceLine;
    node.FrameType = metadata.FrameType;
    node.SourceFilename = metadata.SourceFilename;
    node.FileID = metadata.FileID;
    node.AddressOrLine = metadata.AddressOrLine;
    break;
  }
}

function sortNodes(
  nodes: Map<FrameGroupID, CallerCalleeIntermediateNode>
): CallerCalleeIntermediateNode[] {
  const sortedNodes = new Array<CallerCalleeIntermediateNode>();
  for (const node of nodes.values()) {
    sortedNodes.push(node);
  }
  return sortedNodes.sort((n1, n2) => {
    return compareFrameGroup(n1.frameGroup, n2.frameGroup);
  });
}

// fromCallerCalleeIntermediateNode is used to convert the intermediate representation
// of the diagram into the format that is easily JSONified and more easily consumed by
// others.
export function fromCallerCalleeIntermediateNode(
  root: CallerCalleeIntermediateNode
): CallerCalleeNode {
  const node = buildCallerCalleeNode({ Samples: root.samples });

  // Populate the other fields with data from the root node. Selectors are not supposed
  // to be able to fail.
  selectCallerCalleeData(root.frameMetadata, node);

  // Now fill the caller and callee arrays.
  // For a deterministic result we have to walk the callers / callees in a deterministic
  // order. A deterministic result allows deterministic UI views, something that users expect.
  for (const caller of sortNodes(root.callers)) {
    node.Callers.push(fromCallerCalleeIntermediateNode(caller));
  }
  for (const callee of sortNodes(root.callees)) {
    node.Callees.push(fromCallerCalleeIntermediateNode(callee));
  }

  return node;
}

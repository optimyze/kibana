/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { override } from '.';

export type StackTraceID = string;
export type StackFrameID = string;
export type FileID = string;

export interface StackTraceEvent {
  StackTraceID: StackTraceID;
  Count: number;
}

export interface StackTrace {
  FileID: string[];
  FrameID: string[];
  Type: number[];
}

export type StackFrame = {
  FileName: string;
  FunctionName: string;
  FunctionOffset: number;
  LineNumber: number;
  SourceType: number;
};

export interface Executable {
  FileName: string;
}

export type StackFrameMetadata = {
  // StackTrace.FileID
  FileID: FileID;
  // StackTrace.Type
  FrameType: number;
  // stringified FrameType -- FrameType.String()
  FrameTypeString: string;

  // StackFrame.LineNumber?
  AddressOrLine: number;
  // StackFrame.FunctionName
  FunctionName: string;
  // StackFrame.FunctionOffset
  FunctionOffset: number;
  // should this be StackFrame.SourceID?
  SourceID: FileID;
  // StackFrame.LineNumber
  SourceLine: number;

  // value defined by:
  //   if StackFrame.FunctionOffset > 0:
  //     StackFrame.LineNumber - StackFrame.FunctionOffset
  //   else:
  //     0
  //
  // Unknown/invalid offsets are currently set to 0.
  //
  // In this case we leave FunctionLine=0 as a flag for the UI that the
  // FunctionLine should not be displayed.
  //
  // As offset=0 could also be a legit value, this work-around needs a real fix.
  // The idea for after GA is to change offset=-1 to indicate unknown/invalid.
  FunctionLine: number;

  // Executable.FileName
  ExeFileName: string;

  // unused atm due to lack of symbolization metadata
  CommitHash: string;
  // unused atm due to lack of symbolization metadata
  SourceCodeURL: string;
  // unused atm due to lack of symbolization metadata
  SourceFilename: string;
  // unused atm due to lack of symbolization metadata
  SourcePackageHash: string;
  // unused atm due to lack of symbolization metadata
  SourcePackageURL: string;
  // unused atm due to lack of symbolization metadata
  SourceType: number;

  Index: number;
};

const defaultStackFrameMetadata: StackFrameMetadata = {
  FileID: '',
  FrameType: 0,
  FrameTypeString: '',

  AddressOrLine: 0,
  FunctionName: '',
  FunctionOffset: 0,
  SourceID: '',
  SourceLine: 0,

  FunctionLine: 0,

  ExeFileName: '',

  CommitHash: '',
  SourceCodeURL: '',
  SourceFilename: '',
  SourcePackageHash: '',
  SourcePackageURL: '',
  SourceType: 0,

  Index: 0,
};

export function buildStackFrameMetadata(
  metadata: Partial<StackFrameMetadata> = {}
): StackFrameMetadata {
  return override(defaultStackFrameMetadata, metadata);
}

export type FrameGroup = Pick<
  StackFrameMetadata,
  'FileID' | 'ExeFileName' | 'FunctionName' | 'AddressOrLine' | 'SourceFilename'
>;

const defaultFrameGroup: FrameGroup = {
  FileID: '',
  ExeFileName: '',
  FunctionName: '',
  AddressOrLine: 0,
  SourceFilename: '',
};

// This is a convenience function to build a FrameGroup value with
// defaults for missing fields
export function buildFrameGroup(frameGroup: Partial<FrameGroup> = {}): FrameGroup {
  return override(defaultFrameGroup, frameGroup);
}

export function compareFrameGroup(a: FrameGroup, b: FrameGroup): number {
  if (a.ExeFileName < b.ExeFileName) return -1;
  if (a.ExeFileName > b.ExeFileName) return 1;
  if (a.SourceFilename < b.SourceFilename) return -1;
  if (a.SourceFilename > b.SourceFilename) return 1;
  if (a.FunctionName < b.FunctionName) return -1;
  if (a.FunctionName > b.FunctionName) return 1;
  if (a.FileID < b.FileID) return -1;
  if (a.FileID > b.FileID) return 1;
  if (a.AddressOrLine < b.AddressOrLine) return -1;
  if (a.AddressOrLine > b.AddressOrLine) return 1;
  return 0;
}

// defaultGroupBy is the "standard" way of grouping frames, by commonly
// shared group identifiers.
//
// For ELF-symbolized frames, group by FunctionName and FileID.
// For non-symbolized frames, group by FileID and AddressOrLine.
// Otherwise group by ExeFileName, SourceFilename and FunctionName.
export function defaultGroupBy(frame: StackFrameMetadata): FrameGroup {
  const frameGroup = buildFrameGroup();

  if (frame.FunctionName === '') {
    // Non-symbolized frame where we only have FileID and AddressOrLine
    frameGroup.FileID = frame.FileID;
    frameGroup.AddressOrLine = frame.AddressOrLine;
  } else if (frame.SourceFilename === '') {
    // Non-symbolized frame with FunctionName set from ELF data
    frameGroup.FunctionName = frame.FunctionName;
    frameGroup.FileID = frame.FileID;
  } else {
    // This is a symbolized frame
    frameGroup.ExeFileName = frame.ExeFileName;
    frameGroup.SourceFilename = frame.SourceFilename;
    frameGroup.FunctionName = frame.FunctionName;
  }

  return frameGroup;
}

export type FrameGroupID = string;

export function hashFrameGroup(frameGroup: FrameGroup): FrameGroupID {
  // We use serialized JSON as the unique value of a frame group for now
  return JSON.stringify(frameGroup);
}

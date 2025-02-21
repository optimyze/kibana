/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  SavedObjectMigrationContext,
  SavedObjectSanitizedDoc,
  SavedObjectUnsanitizedDoc,
} from 'kibana/server';
import { CommentRequestAlertType, CommentType } from '../../../../common/api';
import { logError } from '../utils';
import { UserActionVersion800 } from './types';

/* eslint-disable @typescript-eslint/naming-convention */

export function removeRuleInformation(
  doc: SavedObjectUnsanitizedDoc<UserActionVersion800>,
  context: SavedObjectMigrationContext
): SavedObjectSanitizedDoc<unknown> {
  const originalDocWithReferences = { ...doc, references: doc.references ?? [] };

  try {
    const { new_value, action, action_field } = doc.attributes;

    const decodedNewValueData = decodeNewValue(new_value);

    if (!isAlertUserAction(action, action_field, decodedNewValueData)) {
      return originalDocWithReferences;
    }

    const encodedValue = JSON.stringify({
      ...decodedNewValueData,
      rule: {
        id: null,
        name: null,
      },
    });

    return {
      ...doc,
      attributes: {
        ...doc.attributes,
        new_value: encodedValue,
      },
      references: doc.references ?? [],
    };
  } catch (error) {
    logError({
      id: doc.id,
      context,
      error,
      docType: 'user action alerts',
      docKey: 'userAction',
    });

    return originalDocWithReferences;
  }
}

function decodeNewValue(data?: string | null): unknown | null {
  if (data === undefined || data === null) {
    return null;
  }

  return JSON.parse(data);
}

function isAlertUserAction(
  action?: string,
  actionFields?: string[],
  newValue?: unknown | null
): newValue is AlertCommentOptional {
  return isCreateComment(action, actionFields) && isAlertObject(newValue);
}

function isCreateComment(action?: string, actionFields?: string[]): boolean {
  return (
    action === 'create' &&
    actionFields !== null &&
    actionFields !== undefined &&
    actionFields.includes('comment')
  );
}

type AlertCommentOptional = Partial<CommentRequestAlertType>;

function isAlertObject(data?: unknown | null): boolean {
  const unsafeAlertData = data as AlertCommentOptional;

  return (
    unsafeAlertData !== undefined &&
    unsafeAlertData !== null &&
    (unsafeAlertData.type === CommentType.generatedAlert ||
      unsafeAlertData.type === CommentType.alert)
  );
}

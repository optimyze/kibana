/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React, { useState } from 'react';

import {
  EuiButton,
  EuiButtonEmpty,
  EuiFieldText,
  EuiFlexItem,
  EuiFlexGroup,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiSpacer,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';

interface SettingsFlyoutProps {
  defaultProjectID: number;
  updateProjectID: (n: number) => void;
}

export function SettingsFlyout({ defaultProjectID, updateProjectID }: SettingsFlyoutProps) {
  const [projectID, setProjectID] = useState(defaultProjectID);
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  const flyoutTitleId = useGeneratedHtmlId({
    prefix: 'settings',
  });

  const showFlyout = () => setIsFlyoutVisible(true);

  const closeFlyout = () => setIsFlyoutVisible(false);

  const saveFlyout = () => {
    updateProjectID(projectID);
    setIsFlyoutVisible(false);
  };

  const onProjectIDChange = (e: any) => setProjectID(e.target.value);

  return (
    <div>
      <EuiButton onClick={showFlyout}>Settings</EuiButton>
      {isFlyoutVisible && (
        <EuiFlyout ownFocus onClose={closeFlyout} hideCloseButton aria-labelledby={flyoutTitleId}>
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m">
              <h2 id={flyoutTitleId}>Settings</h2>
            </EuiTitle>
            <EuiSpacer size="s" />
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiForm component="form">
              <EuiFormRow label="Project ID">
                <EuiFieldText name="projectID" value={projectID} onChange={onProjectIDChange} />
              </EuiFormRow>
            </EuiForm>
          </EuiFlyoutBody>
          <EuiFlyoutFooter>
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty iconType="cross" onClick={closeFlyout} flush="left">
                  Close
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton onClick={saveFlyout} fill>
                  Save
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </EuiFlyout>
      )}
    </div>
  );
}

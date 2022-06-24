/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React, { useContext, useEffect } from 'react';

import {
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiNotificationBadge,
  EuiSpacer,
  EuiSplitPanel,
  EuiTitle,
} from '@elastic/eui';

import { BarChart } from './bar-chart';
import { TopNContext } from './contexts/topn';
import { TopNSubchart } from '../../common/topn';

export interface ChartGridProps {
  maximum: number;
}

export const ChartGrid: React.FC<ChartGridProps> = ({ maximum }) => {
  const ctx = useContext(TopNContext);
  const printSubCharts = (subcharts: TopNSubchart[]) => {
    const ncharts = Math.min(maximum, subcharts.length);

    const charts = [];
    for (let i = 0; i < ncharts; i++) {
      const subchart = subcharts[i];
      const uniqueID = `bar-chart-${i}`;

      const barchart = (
        <BarChart
          id={uniqueID}
          name={subchart.Category}
          height={200}
          data={subchart.Series}
          x="Timestamp"
          y="Count"
        />
      );

      const title = (
        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiNotificationBadge>{i + 1}</EuiNotificationBadge>
          </EuiFlexItem>
          <EuiFlexItem>{subchart.Category}</EuiFlexItem>
          <EuiFlexItem grow={false}>{subchart.Percentage.toFixed(2)}%</EuiFlexItem>
        </EuiFlexGroup>
      );

      const card = (
        <EuiSplitPanel.Outer>
          <EuiSplitPanel.Inner>{title}</EuiSplitPanel.Inner>
          <EuiSplitPanel.Inner>{barchart}</EuiSplitPanel.Inner>
        </EuiSplitPanel.Outer>
      );

      charts.push(<EuiFlexItem>{card}</EuiFlexItem>);
    }
    return charts;
  };

  useEffect(() => {
    console.log(new Date().toISOString(), 'updated chart-grid');
  }, [ctx]);

  return (
    <>
      <EuiSpacer />
      <EuiTitle size="s">
        <h1>Top {ctx.subcharts.length}</h1>
      </EuiTitle>
      <EuiSpacer />
      <EuiFlexGrid columns={2} gutterSize="s">
        {printSubCharts(ctx.subcharts)}
      </EuiFlexGrid>
    </>
  );
};

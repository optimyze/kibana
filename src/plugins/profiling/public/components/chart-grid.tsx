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

import { TopNContext } from './contexts/topn';
import { BarChart } from './bar-chart';

export interface ChartGridProps {
  maximum: number;
}

export const ChartGrid: React.FC<ChartGridProps> = ({ maximum }) => {
  const ctx = useContext(TopNContext);
  const printSubCharts = (series: any) => {
    let keys: string[] = Array.from(series.keys());
    const ncharts = Math.min(maximum, series.size);
    keys = keys.slice(0, ncharts);

    const charts = [];
    for (let i = 0; i < ncharts; i++) {
      const subdata = ctx.series.get(keys[i]);
      const uniqueID = `bar-chart-${i}`;

      const barchart = (
        <BarChart id={uniqueID} name={keys[i]} height={200} data={subdata} x="x" y="y" />
      );

      const title = (
        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiNotificationBadge>{i + 1}</EuiNotificationBadge>
          </EuiFlexItem>
          <EuiFlexItem>{keys[i]}</EuiFlexItem>
          <EuiFlexItem grow={false}>100%</EuiFlexItem>
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
        <h1>Top {ctx.series.size}</h1>
      </EuiTitle>
      <EuiSpacer />
      <EuiFlexGrid columns={2} gutterSize="s">
        {printSubCharts(ctx.series)}
      </EuiFlexGrid>
    </>
  );
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { AppMountParameters } from 'kibana/public';

import {
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiPageHeader,
  EuiSpacer,
  EuiTabbedContent,
} from '@elastic/eui';

import { SettingsFlyout } from './components/settings-flyout';

import { TopNContext } from './components/contexts/topn';
import { StackTraceNavigation } from './components/stacktrace-nav';
import { StackedBarChart } from './components/stacked-bar-chart';
import { ChartGrid } from './components/chart-grid';

import { FlameGraphContext } from './components/contexts/flamegraph';
import { FlameGraphNavigation } from './components/flamegraph-nav';
import { FlameGraph } from './components/flamegraph';
import { PixiFlamechart } from './components/PixiFlamechart';

import { Services } from './services';

type Props = Services;

function App({
  fetchTopN,
  fetchElasticFlamechart,
  fetchElasticFlamechart2,
  fetchPixiFlamechart,
}: Props) {
  const [projectID, setProjectID] = useState(1);

  const [topn, setTopN] = useState({
    samples: [],
    series: new Map(),
  });

  const [elasticFlamegraph, setElasticFlamegraph] = useState({ leaves: [] });
  const [elasticFlamegraph2, setElasticFlamegraph2] = useState({ leaves: [] });
  const [pixiFlamegraph, setPixiFlamegraph] = useState({});

  const updateProjectID = (n: number) => setProjectID(n);

  const tabs = [
    {
      id: 'stacktrace-elastic',
      name: 'Stack Traces (Elastic)',
      content: (
        <>
          <EuiSpacer />
          <TopNContext.Provider value={topn}>
            <StackTraceNavigation fetchTopN={fetchTopN} setTopN={setTopN} />
            <StackedBarChart id="topn" name="topn" height={400} x="x" y="y" category="g" />
            <ChartGrid maximum={10} />
          </TopNContext.Provider>
        </>
      ),
    },
    {
      id: 'flamegraph-elastic',
      name: 'FlameGraph (Elastic)',
      content: (
        <>
          <EuiSpacer />
          <FlameGraphContext.Provider value={elasticFlamegraph}>
            <FlameGraphNavigation getter={fetchElasticFlamechart} setter={setElasticFlamegraph} />
            <FlameGraph id="flamechart" height={600} />
          </FlameGraphContext.Provider>
        </>
      ),
    },
    {
      id: 'flamegraph-elastic2',
      name: 'FlameGraph (Elastic2)',
      content: (
        <>
          <EuiSpacer />
          <FlameGraphContext.Provider value={elasticFlamegraph2}>
            <FlameGraphNavigation getter={fetchElasticFlamechart2} setter={setElasticFlamegraph2} />
            <FlameGraph id="flamechart" height={600} />
          </FlameGraphContext.Provider>
        </>
      ),
    },
    {
      id: 'flamegraph-pixi',
      name: 'FlameGraph (Pixi)',
      content: (
        <>
          <EuiSpacer />
          <FlameGraphContext.Provider value={pixiFlamegraph}>
            <FlameGraphNavigation getter={fetchPixiFlamechart} setter={setPixiFlamegraph} />
            <PixiFlamechart projectID={projectID.toString()} />
          </FlameGraphContext.Provider>
        </>
      ),
    },
  ];

  return (
    <EuiPage>
      <EuiPageBody paddingSize="none">
        <EuiPageHeader
          paddingSize="s"
          pageTitle="Continuous Profiling"
          rightSideItems={[
            <SettingsFlyout defaultProjectID={projectID} updateProjectID={updateProjectID} />,
          ]}
        />
        <EuiPageContent>
          <EuiPageContentBody paddingSize="none">
            <EuiTabbedContent tabs={tabs} initialSelectedTab={tabs[0]} autoFocus="selected" />
          </EuiPageContentBody>
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
}

export const renderApp = (props: Props, element: AppMountParameters['element']) => {
  ReactDOM.render(<App {...props} />, element);

  return () => ReactDOM.unmountComponentAtNode(element);
};

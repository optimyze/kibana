#!/usr/bin/env bash

set -euo pipefail

source .buildkite/scripts/common/util.sh

is_test_execution_step

export CODE_COVERAGE=1
echo "reading Kibana stats cluster creds from vault"
export USER_FROM_VAULT="$(retry 5 5 vault read -field=username secret/kibana-issues/prod/coverage/elasticsearch)"
export PASS_FROM_VAULT="$(retry 5 5 vault read -field=password secret/kibana-issues/prod/coverage/elasticsearch)"
export HOST_FROM_VAULT="$(retry 5 5 vault read -field=host secret/kibana-issues/prod/coverage/elasticsearch)"

.buildkite/scripts/bootstrap.sh

node scripts/build_kibana_platform_plugins.js --no-cache

timestamp=$(date +"%Y-%m-%dT%H:%M:%S:00Z")

# download coverage arctifacts
buildkite-agent artifact download target/kibana-coverage/jest/* . --build "${KIBANA_BUILD_ID:-$BUILDKITE_BUILD_ID}"
#buildkite-agent artifact download target/kibana-coverage/functional/* . --build "${KIBANA_BUILD_ID:-$BUILDKITE_BUILD_ID}"

# process HTML Links
#.buildkite/scripts/steps/code_coverage/ingest/prokLinks.sh

# collect VCS Info
#.buildkite/scripts/steps/code_coverage/ingest/collectVcsInfo.sh

# replace path in json files and generate final reports
export COVERAGE_TEMP_DIR=$KIBANA_DIR/target/kibana-coverage
sed -i "s|/opt/local-ssd/buildkite/builds/kb-[[:alnum:]\-]\{20,27\}/elastic/kibana-code-coverage-main/kibana|${KIBANA_DIR}|g" $COVERAGE_TEMP_DIR/jest/*.json
echo $BUILDKITE_BUILD_ID
echo "--- Jest: merging coverage files and generating the final combined report"
yarn nyc report --nycrc-path src/dev/code_coverage/nyc_config/nyc.jest.config.js
rm -rf target/kibana-coverage/jest

#sed -i "s|/opt/local-ssd/buildkite/builds/kb-cigroup-4d-[[:xdigit:]]\{16\}/elastic/kibana-code-coverage-main/kibana|${KIBANA_DIR}|g" $COVERAGE_TEMP_DIR/functional/*.json
#echo "### Functional: merging json files and generating the final combined report"
#yarn nyc report --nycrc-path src/dev/code_coverage/nyc_config/nyc.functional.config.js
#rm -rf target/kibana-coverage/functional

# archive reports to upload as build artifacts
#echo "--- Archive combined functional report"
#tar -czf kibana-functional-coverage.tar.gz target/kibana-coverage/functional-combined
echo "--- Archive combined jest report"
tar -czf kibana-jest-coverage.tar.gz target/kibana-coverage/jest-combined

# upload combined reports
ls -laR target/kibana-coverage/
# upload upload coverage static site
#.buildkite/scripts/steps/code_coverage/ingest/uploadStaticSite.sh
# ingest results to Kibana stats cluster
previousSha=abcde1234
BUILD_NUMBER=12345
.src/dev/code_coverage/shell_scripts/generate_team_assignments_and_ingest_coverage.sh 'code-coverage' ${BUILD_NUMBER} '${BUILD_URL}' '${previousSha}' 'src/dev/code_coverage/ingest_coverage/team_assignment/team_assignments.txt'

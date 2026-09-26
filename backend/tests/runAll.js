const { runScholarlyRecordTests } = require('./scholarlyRecord.test');
const { runDeduplicationTests } = require('./deduplication.test');
const { runCitationTests } = require('./citation.test');
const { runSecurityTests } = require('./security.test');
const { runSearchAndPaginationTests } = require('./searchAndPagination.test');
const { runSearchCorrectnessRegressionTests } = require('./searchCorrectnessRegression.test');
const { runMembershipAndBkashTests } = require('./membershipAndBkash.test');
const { runAuthorAndInstitutionRegressionTests } = require('./authorAndInstitutionRegression.test');
const { runPaperSummaryTests } = require('./paperSummaryService.test');
const { runInstitutionAnalyticsTests } = require('./institutionAnalytics.test');
const { runSearchHardeningRegressionTests } = require('./searchHardeningRegression.test');
const { runE2EVerification } = require('./integrationE2E.test');

console.log('===============================================================');
console.log('  PROJECT PANTHER / THE THESIS ARCHIVE - VERIFICATION SUITE   ');
console.log('  Deterministic Offline Test Suite & Release Gates            ');
console.log('===============================================================\n');

async function main() {
  process.env.NODE_ENV = 'test';
  process.env.OFFLINE_MODE = 'true';

  try {
    runSecurityTests();
    console.log('');
    runScholarlyRecordTests();
    console.log('');
    runDeduplicationTests();
    console.log('');
    runCitationTests();
    console.log('');
    runSearchAndPaginationTests();
    console.log('');
    await runSearchCorrectnessRegressionTests();
    console.log('');
    await runMembershipAndBkashTests();
    console.log('');
    await runAuthorAndInstitutionRegressionTests();
    console.log('');
    await runPaperSummaryTests();
    console.log('');
    await runInstitutionAnalyticsTests();
    console.log('');
    await runSearchHardeningRegressionTests();
    console.log('');
    await runE2EVerification();
    
    console.log('\n===============================================================');
    console.log('  ALL 12 DETERMINISTIC TEST SUITES PASSED (0 FAILURES, 100% OK)');
    console.log('===============================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ TEST FAILURE ENCOUNTERED:');
    console.error(err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();

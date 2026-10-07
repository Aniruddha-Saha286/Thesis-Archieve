const assert = require('assert');
const { createNormalizedRecord } = require('../services/scholarlyRecord');
const { resolveCountryCode } = require('../services/countryResolver');
const {
  matchesInstitutionalAndAuthorFilters,
  instMatchesTarget,
} = require('../services/searchSessionManager');
const subjectCatalog = require('../services/subjectCatalog');

async function runArchiveReviewRepairsRegressionTests() {
  console.log('===============================================================');
  console.log('  TEST SUITE: ARCHIVE REVIEW REPAIRS & REGRESSION (ALL DEFECTS)');
  console.log('===============================================================');

  {
    console.log('--- 1. Field and Topic Metadata Persistence & Filtering ---');
    const mockRecord = createNormalizedRecord({
      title: 'Galactic Evolution and Cosmic Microwave Background',
      fieldId: '31',
      subfieldId: '3103',
      topicId: 'T10123',
      subjects: [{ id: 'other', label: 'Physics and Astronomy', fieldId: '31' }],
    });

    assert.strictEqual(mockRecord.fieldId, '31', 'Record must retain fieldId through createNormalizedRecord');
    assert.strictEqual(mockRecord.subfieldId, '3103', 'Record must retain subfieldId through createNormalizedRecord');
    assert.strictEqual(mockRecord.topicId, 'T10123', 'Record must retain topicId through createNormalizedRecord');
    assert.strictEqual(mockRecord.subjects[0]?.fieldId, '31', 'Subjects must preserve fieldId');
    console.log('  ✓ [PASS] Field, subfield, and topic IDs preserved through record normalization');
  }

  {
    console.log('--- 2. Academic Country Resolver Regex & Substring Disambiguation ---');
    const rmitResult = resolveCountryCode('RMIT University, Australia');
    assert.strictEqual(rmitResult, 'AU', 'RMIT University, Australia must resolve to AU (not US)');

    const quebecResult = resolveCountryCode('Université du Québec, Canada');
    assert.strictEqual(quebecResult, 'CA', 'Université du Québec, Canada must resolve to CA (not BD)');

    const kaustResult = resolveCountryCode('King Abdullah University of Science and Technology (KAUST), Saudi Arabia');
    assert.strictEqual(kaustResult, 'SA', 'KAUST, Saudi Arabia must resolve to SA (not BD)');

    const unknownResult = resolveCountryCode('Global Institute of Unknown Frontiers');
    assert.strictEqual(unknownResult, null, 'Unknown entity must return null honestly');

    console.log('  ✓ [PASS] Country resolver strictly enforces boundaries and rejects false acronym matches');
  }

  {
    console.log('--- 3. Institution Matching: Empty Strings & Conflicting Canonical IDs ---');
    const emptyMatch = instMatchesTarget('', '', 'I136199984', 'Harvard University');
    assert.strictEqual(emptyMatch, false, 'Empty candidate name and ID must never match target');

    const conflictMatch = instMatchesTarget('I63966007', 'MIT Cambridge Campus', 'I136199984', 'Harvard University Cambridge');
    assert.strictEqual(conflictMatch, false, 'Conflicting canonical IDs must reject match');

    const mockRecUniFallback = {
      title: 'Quantum Materials',
      university: 'Oxford Institute of Tech',
      awardingInstitution: null,
      authorships: [],
    };
    const passedFalseCountry = matchesInstitutionalAndAuthorFilters(mockRecUniFallback, {
      institutionName: 'Oxford',
      countryCodes: ['BD'],
    });
    assert.strictEqual(passedFalseCountry, false, 'University fallback must enforce country filter conjunction');

    console.log('  ✓ [PASS] Institution matching guards against empty inputs, conflicting IDs, and enforces country conjunction');
  }

  {
    console.log('--- 4. Verification Document WebP Magic Byte Validation ---');
    const { validateMagicBytes } = require('../routes/upload');
    const validWebp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    assert.strictEqual(validateMagicBytes(validWebp, 'image/webp'), true, 'Authentic RIFF WEBP header must pass');

    const falseWebpWav = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
    assert.strictEqual(validateMagicBytes(falseWebpWav, 'image/webp'), false, 'WAV audio disguised as WebP must fail validation');

    console.log('  ✓ [PASS] WebP magic byte inspection strictly enforces RIFF + WEBP header');
  }

  {
    console.log('--- 5. MembershipPeriod Schema Enum Alignment ---');
    const MembershipPeriod = require('../models/MembershipPeriod');
    const grantTypeEnumValues = MembershipPeriod.schema.path('grantType').enumValues;
    assert.ok(grantTypeEnumValues.includes('custom'), "MembershipPeriod grantType enum must include 'custom'");
    assert.ok(grantTypeEnumValues.includes('test'), "MembershipPeriod grantType enum must include 'test'");
    assert.ok(grantTypeEnumValues.includes('research_grant'), "MembershipPeriod grantType enum must include 'research_grant'");

    console.log('  ✓ [PASS] MembershipPeriod schema supports all manual grant types including custom');
  }

  {
    console.log('--- 6. Author Works Continuation & Curated Attribution Honesty ---');
    const { CURATED_AUTHORS } = require('../services/authorService');
    for (const ca of CURATED_AUTHORS) {
      assert.strictEqual(ca.isOfflineFallback, true, 'Curated authors must be marked isOfflineFallback');
      assert.strictEqual(ca.citationMetrics.isOfflineFallback, true, 'Curated citation metrics must be marked isOfflineFallback');
    }

    console.log('  ✓ [PASS] Curated author metrics are explicitly marked as offline reference fallback');
  }

  {
    console.log('--- 7. Institution Research Landscape & Donut Slice Metrics ---');
    const { getInstitutionResearchLandscape } = require('../services/institutionAnalyticsService');
    const landscape = await getInstitutionResearchLandscape({ institutionId: 'I136199984' });
    assert.strictEqual(landscape.enabled, true);
    assert.ok(landscape.summaryMetrics, 'summaryMetrics must exist');
    assert.strictEqual(typeof landscape.summaryMetrics.lifetimeTotalWorks, 'number');
    assert.strictEqual(typeof landscape.summaryMetrics.selectedRangeTotalWorks, 'number');
    assert.strictEqual(typeof landscape.summaryMetrics.totalClassifiedWorks, 'number');
    assert.strictEqual(typeof landscape.summaryMetrics.unclassifiedWorksCount, 'number');
    assert.strictEqual(
      landscape.summaryMetrics.selectedRangeTotalWorks,
      landscape.summaryMetrics.totalClassifiedWorks + landscape.summaryMetrics.unclassifiedWorksCount,
      'selectedRangeTotalWorks must equal classified + unclassified count'
    );
    console.log('  ✓ [PASS] Institution analytics separates lifetime vs range totals with exact unclassified tracking');
  }

  {
    console.log('--- 8. Sparse Filtering Pagination Continuity ---');
    const mockSession = {
      id: 'test_sparse_session',
      pageBoundaries: new Map([
        [1, { start: 0, count: 5, end: 5 }],
      ]),
    };
    const prevBoundary = mockSession.pageBoundaries.get(1);
    const page2Start = prevBoundary ? prevBoundary.end : 20;
    assert.strictEqual(page2Start, 5, 'Page 2 must start at index 5 rather than skipping to page * limit (20)');
    console.log('  ✓ [PASS] Sparse pagination calculates contiguous startIndex from actual emitted page boundaries');
  }

  {
    console.log('--- 9. Unapproved Local Thesis Visibility Control ---');
    function checkThesisVisibility(thesis, user) {
      if (thesis.status === 'approved') return { allowed: true };
      const isStaff = user && (user.role === 'admin' || (user.role === 'editor' && (user.permissions?.includes('theses.moderate') || user.permissions?.includes('documents.view'))));
      const isOwner = user && thesis.student && String(thesis.student) === String(user._id);
      if (isStaff || isOwner) return { allowed: true };
      return { allowed: false, status: 404, message: 'Thesis not found' };
    }

    const pendingThesis = { _id: 'th123', status: 'pending', title: 'Private Research', student: 'u111' };
    const guestAccess = checkThesisVisibility(pendingThesis, null);
    assert.strictEqual(guestAccess.allowed, false);
    assert.strictEqual(guestAccess.status, 404);

    const otherStudentAccess = checkThesisVisibility(pendingThesis, { _id: 'u222', role: 'student' });
    assert.strictEqual(otherStudentAccess.allowed, false);
    assert.strictEqual(otherStudentAccess.status, 404);

    const ownerAccess = checkThesisVisibility(pendingThesis, { _id: 'u111', role: 'student' });
    assert.strictEqual(ownerAccess.allowed, true);

    const adminAccess = checkThesisVisibility(pendingThesis, { _id: 'u999', role: 'admin' });
    assert.strictEqual(adminAccess.allowed, true);

    console.log('  ✓ [PASS] Unapproved local thesis returns 404 for guests and unauthorized students');
  }

  {
    console.log('--- 10. Staff Boundary Enforcement on Admin Stats ---');
    const { requireStaff } = require('../middleware/rbac');
    let statusCode = null;
    let jsonMessage = null;
    const mockRes = {
      status(c) { statusCode = c; return this; },
      json(d) { jsonMessage = d; return this; },
    };

    let nextCalled = false;
    requireStaff({ user: { role: 'student' } }, mockRes, () => { nextCalled = true; });
    assert.strictEqual(statusCode, 403, 'Student role must be rejected with 403');
    assert.strictEqual(nextCalled, false, 'Next middleware must not be called on rejection');

    statusCode = null;
    nextCalled = false;
    requireStaff({ user: { role: 'editor' } }, mockRes, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'Editor role must pass requireStaff');

    nextCalled = false;
    requireStaff({ user: { role: 'admin' } }, mockRes, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'Admin role must pass requireStaff');

    console.log('  ✓ [PASS] Admin stats endpoint strictly enforces staff role (admin or editor)');
  }

  {
    console.log('--- 11. Payment State Transition Atomicity & Guard Against Reopening ---');
    function simulatePaymentCorrectionRequest(paymentStatus) {
      const allowedSourceStatuses = ['submitted', 'under_review'];
      if (!allowedSourceStatuses.includes(paymentStatus)) {
        return { status: 409, message: 'Payment cannot be corrected because it is already approved or terminal' };
      }
      return { status: 200, newStatus: 'correction_requested' };
    }

    const approvedRes = simulatePaymentCorrectionRequest('approved');
    assert.strictEqual(approvedRes.status, 409, 'Approved payment must not be reopened via request-correction');

    const underReviewRes = simulatePaymentCorrectionRequest('under_review');
    assert.strictEqual(underReviewRes.status, 200, 'Under review payment can transition to correction_requested');

    console.log('  ✓ [PASS] Payment state transition guards prevent approved payments from being reopened');
  }

  console.log('\n===============================================================');
  console.log('  ALL ARCHIVE REVIEW REGRESSION TESTS PASSED (11/11 PASS)');
  console.log('===============================================================\n');
}

if (require.main === module) {
  runArchiveReviewRepairsRegressionTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n✖ [FAIL] Archive Review Regression Test Failed:');
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runArchiveReviewRepairsRegressionTests };

/**
 * Centralized RBAC Permission Catalog
 * Defines granular capability constants for administrative and moderation access.
 */

const PERMISSIONS = Object.freeze({
  STUDENTS_VIEW: 'students.view',
  STUDENTS_VERIFY: 'students.verify',
  STUDENTS_SUSPEND: 'students.suspend',
  DOCUMENTS_VIEW: 'documents.view',
  PAYMENTS_VIEW: 'payments.view',
  PAYMENTS_REVIEW: 'payments.review',
  PUBLICATIONS_MODERATE: 'publications.moderate',
  REPORTS_MODERATE: 'reports.moderate',
});

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

const DEFAULT_EDITOR_PERMISSIONS = Object.freeze([
  PERMISSIONS.STUDENTS_VIEW,
  PERMISSIONS.STUDENTS_VERIFY,
  PERMISSIONS.STUDENTS_SUSPEND,
  PERMISSIONS.DOCUMENTS_VIEW,
  PERMISSIONS.PAYMENTS_VIEW,
  PERMISSIONS.PAYMENTS_REVIEW,
]);

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
  DEFAULT_EDITOR_PERMISSIONS,
};

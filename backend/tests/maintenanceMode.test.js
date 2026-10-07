const assert = require('assert');
const {
  getMaintenanceStatus,
  getCachedMaintenanceStatus,
  setMaintenanceStatus,
} = require('../services/systemSettingService');
const { checkMaintenance } = require('../middleware/maintenanceMiddleware');
const { requireAdmin } = require('../middleware/rbac');

async function runMaintenanceModeTests() {
  console.log('Testing: Admin-Controlled Maintenance Mode & Invariants Suite...');

  function createMockResponse() {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    return res;
  }

  {
    const status = getCachedMaintenanceStatus();
    assert.strictEqual(typeof status.enabled, 'boolean');
    assert.strictEqual(typeof status.message, 'string');
    console.log('  ✓ [PASS] Cached maintenance status returns authoritative default shape');
  }

  {
    await setMaintenanceStatus({
      enabled: false,
      message: 'System operating normally',
      updatedBy: 'tester',
    });

    let nextCalled = false;
    const req = { baseUrl: '/api', path: '/theses', user: { role: 'student' } };
    const res = createMockResponse();

    checkMaintenance(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'Next must be called when maintenance is disabled');
    assert.strictEqual(res.statusCode, 200);
    console.log('  ✓ [PASS] When maintenance is disabled, student requests proceed without disruption');
  }

  {
    const customNotice = 'Scheduled depository maintenance in progress. Expected return 18:00 UTC.';
    await setMaintenanceStatus({
      enabled: true,
      message: customNotice,
      updatedBy: 'chief_admin',
    });

    const status = getCachedMaintenanceStatus();
    assert.strictEqual(status.enabled, true);
    assert.strictEqual(status.message, customNotice);

    let nextCalled = false;
    const req = { baseUrl: '/api', path: '/theses', user: { role: 'student' } };
    const res = createMockResponse();

    checkMaintenance(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, 'Next must NOT be called for blocked student request');
    assert.strictEqual(res.statusCode, 503, 'Must respond with HTTP 503 Service Unavailable');
    assert.strictEqual(res.body?.code, 'MAINTENANCE_MODE');
    assert.strictEqual(res.body?.message, customNotice);
    console.log('  ✓ [PASS] When maintenance is enabled, student requests are blocked with HTTP 503 and custom notice');
  }

  {
    const exemptEndpoints = [
      '/api/health',
      '/api/system/status',
      '/api/auth/google',
      '/api/auth/google/config',
      '/api/auth/me',
      '/api/auth/logout',
    ];

    for (const ep of exemptEndpoints) {
      let nextCalled = false;
      const req = { baseUrl: '', path: ep, user: null };
      const res = createMockResponse();

      checkMaintenance(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true, `Endpoint ${ep} must be exempt from maintenance mode`);
      assert.strictEqual(res.statusCode, 200);
    }
    console.log('  ✓ [PASS] Essential health, system status, and authentication routes remain reachable during maintenance');
  }

  {
    let nextCalled = false;
    const req = {
      baseUrl: '/api',
      path: '/theses',
      user: { role: 'admin', email: 'sahaaniruddha2004@gmail.com' },
    };
    const res = createMockResponse();

    checkMaintenance(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'Administrator must bypass maintenance restrictions on any route');
    assert.strictEqual(res.statusCode, 200);
    console.log('  ✓ [PASS] Administrator role bypass allows full access during maintenance');
  }

  {
    let nextCalled = false;
    const req = {
      baseUrl: '/api',
      path: '/admin/system/maintenance',
      user: { role: 'editor' },
    };
    const res = createMockResponse();

    checkMaintenance(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'Admin routes pass through maintenance middleware to authorization layer');
    console.log('  ✓ [PASS] Admin endpoints pass through maintenance middleware to trigger strict RBAC validation');
  }

  {
    let quotaDeducted = false;
    const mockCheckQuota = (req, res, next) => {
      quotaDeducted = true;
      next();
    };

    const req = { baseUrl: '/api', path: '/theses', user: { role: 'student' } };
    const res = createMockResponse();

    checkMaintenance(req, res, () => {
      mockCheckQuota(req, res, () => {});
    });

    assert.strictEqual(quotaDeducted, false, 'Quota deduction must NEVER occur when maintenance is active');
    console.log('  ✓ [PASS] Zero quota consumption invariant verified (requests rejected before quota middleware)');
  }

  {
    {
      const req = { user: { role: 'student' } };
      const res = createMockResponse();
      let nextCalled = false;
      requireAdmin(req, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body?.code, 'ADMIN_REQUIRED');
    }

    {
      const req = { user: { role: 'editor', editorPermissions: ['theses.edit'] } };
      const res = createMockResponse();
      let nextCalled = false;
      requireAdmin(req, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body?.code, 'ADMIN_REQUIRED');
    }

    {
      const req = { user: { role: 'admin' } };
      const res = createMockResponse();
      let nextCalled = false;
      requireAdmin(req, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true);
    }
    console.log('  ✓ [PASS] RBAC strictly restricts maintenance toggle to Admin (Editor and Student rejected with 403)');
  }

  await setMaintenanceStatus({
    enabled: false,
    message: 'System operating normally',
    updatedBy: 'tester_cleanup',
  });

  console.log('\n===============================================================');
  console.log('  ALL 8/8 MAINTENANCE MODE TESTS PASSED (100% OK)');
  console.log('===============================================================');
}

module.exports = { runMaintenanceModeTests };

if (require.main === module) {
  runMaintenanceModeTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

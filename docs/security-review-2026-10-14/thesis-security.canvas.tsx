import { H1, H2, Text, Stack, Callout, Divider } from "cursor/canvas";

export default function ThesisSecurityReview() {
  return <Stack>
    <H1>The Thesis Archive — security review</H1>
    <Text>14 October 2026 · 13:13–13:16 Asia/Dhaka · Authorized, non-destructive initial assessment</Text>
    <Callout>Priority: verify and protect student ID storage, then add frontend security headers. No authentication bypass was demonstrated in the tested unauthenticated requests.</Callout>
    <H2>High priority · ID storage privacy — source finding</H2>
    <Text>backend/routes/upload.js uploads identity documents without an authenticated/private delivery type. Cloudinary defaults to public upload delivery. backend/routes/admin.js signs an upload URL and passes expires_at, but a local SDK check with dummy configuration showed that changing expires_at from 1 to 9999999999 produces the same URL. Signing a public URL does not restrict the underlying asset.</Text>
    <Text>Impact: if deployed with default storage settings, someone with a document URL could retrieve sensitive identification without application authorization. Actual production documents and account storage settings were not accessed; public exposure is unverified.</Text>
    <Text>Fix: explicitly use authenticated storage and a supported expiring delivery mechanism or authorized server download. Migrate existing assets, invalidate public delivery caches, and verify unsigned and expired access fails using a synthetic ID document. Update retrieval and deletion to use the same resource and delivery types.</Text>
    <H2>Medium · Frontend browser protections missing — live confirmed</H2>
    <Text>GET https://thesis-archieve.vercel.app/ returned 200 without Content-Security-Policy or X-Frame-Options. X-Content-Type-Options, Referrer-Policy and Permissions-Policy were also absent. HSTS was present. API headers do not protect the separately hosted frontend document.</Text>
    <Text>Impact: no server-declared anti-framing protection or CSP defense against injected scripts. Clickjacking of a sensitive action and an XSS injection were not demonstrated. The public auth bundle stores the bearer token in localStorage, which would increase the consequence of an XSS flaw.</Text>
    <Text>Fix: configure Vercel response headers, including frame-ancestors 'none', object-src 'none', base-uri 'self', nosniff, and an application-specific CSP. Validate Google login, API/WebSocket connections, PDF viewing and other required resources before enforcement.</Text>
    <H2>Informational · Deployment differs from local source</H2>
    <Text>The live API CSP contains unsafe-eval, while local backend/server.js does not. GET /api/research/radar returned 404 although the local source defines that protected route. Local test success cannot establish production behavior or the deployed commit.</Text>
    <Divider />
    <H2>Live checks that behaved as expected</H2>
    <Text>HTTP redirected to HTTPS (308); frontend and API emitted HSTS. GET /api/auth/me, /api/admin/students, /api/admin/payments, /api/user/saved-papers and /api/membership/status returned 401 without authentication. An invalid bearer token returned 401. An untrusted Origin returned 403; the legitimate frontend preflight returned 204 with the exact allowed origin. Empty Google credentials returned 400. Empty legacy login returned 404 with LEGACY_AUTH_DISABLED. Rate-limit headers were present; exhaustion was not tested.</Text>
    <Text>HEAD /.env and /.git/config returned HTML metadata matching the SPA shell, not evidence of leaked configuration. The tested auth JavaScript source-map path returned 403. GET /api/health returned 200. API host was discovered in the deployed public auth JavaScript: https://thesis-archieve-l6ec.onrender.com.</Text>
    <H2>Local verification and limits</H2>
    <Text>All 32 existing deterministic backend suites passed. Some security tests duplicate validation logic, so passing them is not proof that all production controls are correct. No dependency advisory audit, authenticated cross-user access tests, payment workflow tests, upload execution, browser framing proof, infrastructure audit, load test or exhaustive injection assessment was completed. No application code or production data was changed.</Text>
    <Text>Next verification requires disposable student/editor/admin test accounts and synthetic documents in a staging environment, plus confirmation of the deployed commit and Cloudinary access settings.</Text>
    <Text>References: https://cloudinary.com/documentation/control_access_to_media ; https://cloudinary.com/documentation/upload_parameters ; https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors</Text>
  </Stack>;
}

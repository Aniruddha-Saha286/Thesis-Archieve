// Single place that understands membership plan codes sent by the backend
// (entitlementService returns: 'free', 'trial', 'premium_6m', 'pro_max_12m', 'admin').
// Older code compared against 'premium' / 'trial' only, so paid members saw
// "Plan" / "Standard" instead of their real tier.

export function getPlanInfo(plan) {
  const code = String(plan || 'free').toLowerCase();

  if (code === 'pro_max_12m' || code === 'pro_max' || code === 'promax' || code === 'promax_12m') {
    return { key: 'promax', label: 'Pro Max', badge: '★ Pro Max', isPaid: true, isTrial: false };
  }
  if (code === 'premium_6m' || code === 'premium') {
    return { key: 'premium', label: 'Premium', badge: '★ Premium', isPaid: true, isTrial: false };
  }
  if (code === 'trial' || code === 'trial_v1' || code === 'trial_v2') {
    return { key: 'trial', label: '7-Day Trial', badge: '⚡ 7-Day Trial', isPaid: false, isTrial: true };
  }
  if (code === 'admin') {
    return { key: 'admin', label: 'Admin', badge: '★ Admin', isPaid: true, isTrial: false };
  }
  return { key: 'free', label: 'Standard', badge: 'Standard', isPaid: false, isTrial: false };
}

export function isTrialPlan(plan) {
  return getPlanInfo(plan).isTrial;
}

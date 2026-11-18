type Observation = { status: 'available' | 'quota_exhausted' | 'rate_limited' | 'unavailable' | 'error'; checkedAt: string };
const observations = new Map<string, Observation>();
const STATUS_LABELS = { available: '最近调用成功', quota_exhausted: '最近调用额度不足', rate_limited: '最近调用限流', unavailable: '最近调用模型不可用', error: '最近调用失败' };

/** Antigravity runtime records actual outcomes, never inferring availability from catalog membership. */
export function recordAntigravityModelResult(model: string, error?: string) {
  if (!model) return;
  const status = !error ? 'available'
    : /quota.*(?:exceed|exhaust)|(?:exceed|exhaust).*quota|resource_exhausted|额度不足|配额.*(?:耗尽|超出)/i.test(error) ? 'quota_exhausted'
    : /429|rate.?limit|too many requests/i.test(error) ? 'rate_limited'
    : /model.*(?:not supported|not found|unavailable)|unsupported.*model/i.test(error) ? 'unavailable' : 'error';
  if (observations.size >= 200) observations.delete(observations.keys().next().value!);
  observations.set(model, { status, checkedAt: new Date().toISOString() });
}

/** Catalog and quota panel share per-model observations; exact remaining quota is not exposed by agy models. */
export function antigravityModelStatus(model: string, now = Date.now()) {
  const observation = observations.get(model);
  const stale = !!observation && now - Date.parse(observation.checkedAt) > 15 * 60000;
  return { model, status: observation && !stale ? observation.status : 'unknown',
    statusLabel: observation ? `${STATUS_LABELS[observation.status]}${stale ? '（已过期，待重试）' : ''}` : '未验证可用性',
    checkedAt: observation?.checkedAt ?? null, stale, remainingPercent: null, resetsAt: null };
}

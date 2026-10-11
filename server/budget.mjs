// Sponsored AI funding is one permanent, shared dollar cap. Reserve a whole model context and
// maximum output before calling Claude; only a completed, priced usage report can release excess.
// An interrupted call, an ambiguous store result or a restart leaves its reservation in place.
import { randomUUID } from 'node:crypto';
export const BUDGET_KEY = 'ai:budget:v1';
export const LIFETIME_USD = 400;
const MICRO = 1e6;
// Verified October 11, 2026: https://platform.claude.com/docs/en/about-claude/pricing
// Prices are dollars per million tokens. Both models have a 1M context; cache writes reserve the
// higher one-hour multiplier. Standard-only/global requests exclude priority or residency premiums.
const PRICES = Object.freeze({
  'claude-sonnet-5-5': { context: 1000000, input: 2, output: 10 },
  'claude-haiku-5-5': { context: 1000000, input: 0.5, output: 2.5 },
});
const integer = (n) => Number.isSafeInteger(n) && n >= 0;
const bad = () => Object.assign(new Error('The AI funding allowance cannot be checked safely.'), { code: 'unavailable' });

export function reservationCost(params) {
  const model = params && params.model, p = Object.hasOwn(PRICES, model) ? PRICES[model] : null, out = params && params.max_tokens;
  if (!p || !integer(out) || !out || out > 64000 || params.service_tier !== 'standard_only' || params.inference_geo !== 'global' || params.fallbacks) throw bad();
  return Math.ceil(p.context * p.input * 2 + out * p.output);
}

function completedCost(params, msg) {
  if (!msg || msg.model !== params.model || !Object.hasOwn(PRICES, msg.model)) return null;
  const u = msg.usage;
  if (!u || !integer(u.input_tokens) || !integer(u.output_tokens)) return null;
  const write = u.cache_creation_input_tokens == null ? 0 : u.cache_creation_input_tokens;
  const read = u.cache_read_input_tokens == null ? 0 : u.cache_read_input_tokens;
  if (!integer(write) || !integer(read)) return null;
  const all = u.input_tokens + write + read, p = PRICES[msg.model];
  if (!integer(all) || all > p.context || u.output_tokens > params.max_tokens) return null;
  const low = msg.model === 'claude-haiku-5-5' && all <= 100000;
  const input = low ? 0.1 : p.input, output = low ? 0.5 : p.output;
  // Conservatively charge cache reads as ordinary input and writes at the one-hour price. This
  // intentionally does not rely on caching discounts or a provider's optional cache detail fields.
  return Math.ceil((u.input_tokens + read + write * 2) * input + u.output_tokens * output);
}

export function openBudget({ kv, limitUsd = LIFETIME_USD } = {}) {
  if (!Number.isFinite(limitUsd) || limitUsd < 0 || limitUsd > LIFETIME_USD) throw new Error('The sponsored AI lifetime limit must be between $0 and $400.');
  const cap = Math.floor(limitUsd * MICRO);
  function durable() { if (!kv || kv.persistent !== true || typeof kv.reserve !== 'function' || typeof kv.settle !== 'function' || typeof kv.get !== 'function') throw bad(); }
  return {
    async status(calls = { screen: { model: 'claude-haiku-5-5', max_tokens: 400, service_tier: 'standard_only', inference_geo: 'global' } }) {
      durable();
      const value = await kv.get(BUDGET_KEY), used = value == null ? 0 : value;
      if (!integer(used)) throw bad();
      const remaining = Math.max(0, cap - used), actions = Object.fromEntries(Object.entries(calls).map(([name, params]) => [name, remaining >= reservationCost(params)]));
      return { capUsd: cap / MICRO, reservedUsd: used / MICRO, remainingUsd: remaining / MICRO, available: Object.values(actions).some(Boolean), actions };
    },
    async take(params) {
      durable();
      const amount = reservationCost(params), id = randomUUID();
      const r = await kv.reserve(BUDGET_KEY, amount, cap, id);
      if (!r || typeof r.ok !== 'boolean' || !integer(r.used) || r.used > cap) throw bad();
      if (!r.ok) return { ok: false, code: 'budget_exhausted', message: 'The site has used its sponsored AI funding allowance. Kits and existing games are still available.' };
      if (r.used < amount) throw bad();
      let settled = false;
      return {
        ok: true, reservedUsd: amount / MICRO,
        async settle(msg) {
          if (settled) return false;
          settled = true; // Never retry a possibly acknowledged subtraction, even after a store error.
          const cost = completedCost(params, msg);
          if (cost == null || cost > amount) return false;
          const result = await kv.settle(BUDGET_KEY, id, cost);
          if (!result || result.ok !== true || !integer(result.used)) throw bad();
          return true;
        },
      };
    },
  };
}

// End-to-end API tests against an in-memory database: `npm test`
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.LEVELUP_DB = ':memory:';
const { app } = await import('../index.ts');

let server: Server, base = '';
before(() => new Promise<void>((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`; r(); }); }));
after(() => new Promise<void>((r) => { server.close(() => r()); }));

/** A tiny cookie-holding client, one per signed-in person. */
function client() {
  let cookie = '';
  return async (path: string, body?: unknown, method?: string, headers: Record<string, string> = { 'X-LevelUp-Client': 'web' }) => {
    const res = await fetch(base + path, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { 'Content-Type': 'application/json', cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: (await res.json()) as any };
  };
}

const teen = client(), parent = client(), stranger = client();
let familyCode = '', vaultId = '';

test('registration, sessions and role guards', async () => {
  assert.equal((await stranger('/dashboard')).status, 401);
  assert.equal((await stranger('/me')).data.user, null);

  const young = await teen('/auth/register', { role: 'teen', name: 'Too Young', email: 'kid@test.dev', password: 'password1', dob: '2020-01-01' });
  assert.equal(young.data.error.code, 'AGE');

  const r = await teen('/auth/register', { role: 'teen', name: 'Test Teen', email: 'teen@test.dev', password: 'password1', dob: '2008-05-05' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.balance, 0);
  assert.equal(r.data.user.level.xp, 50, 'welcome bonus');
  familyCode = r.data.user.familyCode;

  assert.equal((await teen('/auth/register', { role: 'teen', name: 'Dupe', email: 'teen@test.dev', password: 'password1', dob: '2008-05-05' })).data.error.code, 'EMAIL_TAKEN');
  assert.equal((await stranger('/auth/login', { email: 'teen@test.dev', password: 'wrong-password' })).status, 401);
  assert.equal((await teen('/parent/overview')).status, 403, 'teens cannot use parent routes');
  assert.equal((await teen('/rewards/checkin', {}, 'POST', {})).status, 403, 'writes need the client header');
});

test('wallet: top-up, PIN-gated payments and limits', async () => {
  const add = await teen('/wallet/add', { amount: 500000, source: 'demo_bank' });
  assert.equal(add.data.txn.balanceAfter, 500000);
  assert.equal((await teen('/wallet/add', { amount: 1_500_000, source: 'demo_bank' })).status, 400, 'per top-up cap');

  const pay = { amount: 30000, merchant: 'Zesto Eats', category: 'food', channel: 'online' };
  assert.equal((await teen('/wallet/pay', { ...pay, pin: '4821' })).data.error.code, 'PIN_NOT_SET');
  assert.equal((await teen('/me/pin', { pin: '1234' })).data.error.code, 'WEAK_PIN');
  assert.equal((await teen('/me/pin', { pin: '4821' })).status, 200);
  assert.equal((await teen('/wallet/pay', { ...pay, pin: '0000' })).data.error.code, 'PIN_INVALID');

  const ok = await teen('/wallet/pay', { ...pay, pin: '4821' });
  assert.equal(ok.data.status, 'paid');
  assert.equal(ok.data.txn.balanceAfter, 470000);

  const over = await teen('/wallet/pay', { ...pay, amount: 250000, pin: '4821' });
  assert.equal(over.data.error.code, 'DECLINED');
  assert.match(over.data.error.message, /per-payment limit/);
  const declined = await teen(`/transactions/${over.data.error.txnId}`);
  assert.equal(declined.data.txn.status, 'declined');

  await teen('/card', { frozen: true }, 'PATCH');
  assert.match((await teen('/wallet/pay', { ...pay, pin: '4821' })).data.error.message, /frozen/);
  await teen('/card', { frozen: false }, 'PATCH');

  const send = await teen('/wallet/send', { amount: 10000, to: 'kabir@levelup', pin: '4821' });
  assert.equal(send.data.txn.balanceAfter, 460000);
  assert.ok(send.data.badges.some((b: any) => b.key === 'first_send'));
  assert.equal((await teen('/wallet/send', { amount: 99_000_00, to: 'kabir@levelup', pin: '4821' })).status, 400);

  const reveal = await teen('/card/reveal', { pin: '4821' });
  assert.match(reveal.data.number, /^9999 0000 0000 \d{4}$/, 'demo card numbers use a non-issuable range');
});

test('vaults and the rewards engine', async () => {
  const v = await teen('/vaults', { name: 'Headphones', emoji: '🎧', color: '#8b5cf6', target: 100000, targetDate: null });
  vaultId = v.data.vault.id;
  const d1 = await teen(`/vaults/${vaultId}/deposit`, { amount: 60000 });
  assert.equal(d1.data.vault.saved, 60000);
  assert.equal(d1.data.balance, 400000);
  assert.ok(d1.data.badges.some((b: any) => b.key === 'first_save'));
  assert.equal((await teen(`/vaults/${vaultId}/withdraw`, { amount: 70000 })).data.error.code, 'INSUFFICIENT_VAULT');

  let rewards = (await teen('/rewards')).data;
  const save = rewards.missions.find((m: any) => m.key === 'save_500');
  assert.equal(save.status, 'claimable');
  const claim = await teen('/rewards/missions/save_500/claim', {});
  assert.equal(claim.data.reward.xp, 120);
  assert.equal((await teen('/rewards/missions/save_500/claim', {})).data.error.code, 'ALREADY_CLAIMED');
  assert.equal((await teen('/rewards/missions/track_5/claim', {})).data.error.code, 'NOT_READY');

  const done = await teen(`/vaults/${vaultId}/deposit`, { amount: 40000 });
  assert.equal(done.data.justCompleted, true);
  assert.ok(done.data.badges.some((b: any) => b.key === 'goal_getter'));

  assert.equal((await teen('/rewards/checkin', {})).data.streak, 1);
  assert.equal((await teen('/rewards/checkin', {})).data.error.code, 'ALREADY_CHECKED_IN');

  const quiz = await teen('/quiz/budget_basics', { answers: [1, 2, 1] });
  assert.equal(quiz.data.passed, true);
  assert.equal(quiz.data.reward.xp, 40);
  assert.equal((await teen('/quiz/budget_basics', { answers: [1, 2, 1] })).data.reward, null, 'XP only once per quiz');

  rewards = (await teen('/rewards')).data;
  const coins = rewards.coins;
  assert.equal((await teen('/rewards/redeem', { key: 'movie_1' })).data.error.code, 'NOT_ENOUGH_COINS');
  const boost = await teen('/rewards/redeem', { key: 'wallet_50' });
  assert.equal(boost.data.coins, coins - 250);
  assert.equal(boost.data.user.balance, 365000);

  const answer = await teen('/assistant/ask', { question: 'Can I afford ₹2,000 headphones?' });
  assert.match(answer.data.text, /Yes|Not yet|You have the cash/);
});

test('parent linking, controls and approval workflows', async () => {
  assert.equal((await parent('/auth/register', { role: 'parent', name: 'Test Parent', email: 'parent@test.dev', password: 'password1', familyCode: 'NOPE99' })).data.error.code, 'BAD_FAMILY_CODE');
  const reg = await parent('/auth/register', { role: 'parent', name: 'Test Parent', email: 'parent@test.dev', password: 'password1', familyCode });
  assert.equal(reg.status, 201);
  assert.equal((await parent('/dashboard')).status, 403, 'parents cannot use teen routes');

  let overview = (await parent('/parent/overview')).data;
  assert.equal(overview.children.length, 1);
  const childId = overview.children[0].id;
  assert.equal(overview.children[0].balance, 365000);

  // Another parent cannot reach this child.
  const other = client();
  await other('/auth/register', { role: 'parent', name: 'Other Parent', email: 'other@test.dev', password: 'password1' });
  assert.equal((await other(`/parent/children/${childId}/topup`, { amount: 10000 })).status, 404);
  assert.equal((await other('/parent/children/link', { familyCode })).data.error.code, 'ALREADY_LINKED');

  // Money request → approve.
  await teen('/wallet/request', { amount: 50000, from: 'parent', note: 'Books' });
  overview = (await parent('/parent/overview')).data;
  assert.equal(overview.pending.length, 1);
  assert.equal((await other(`/parent/approvals/${overview.pending[0].id}`, { decision: 'approve' })).status, 404);
  await parent(`/parent/approvals/${overview.pending[0].id}`, { decision: 'approve' });
  assert.equal((await teen('/me')).data.user.balance, 415000);
  assert.equal((await parent(`/parent/approvals/${overview.pending[0].id}`, { decision: 'approve' })).data.error.code, 'ALREADY_RESOLVED');

  // Approval threshold on purchases.
  await parent(`/parent/children/${childId}/controls`, { approvalThreshold: 50000, blockedCategories: ['gaming'] }, 'PATCH');
  const big = await teen('/wallet/pay', { amount: 80000, merchant: 'BookNest', category: 'education', channel: 'instore', pin: '4821' });
  assert.equal(big.status, 202);
  assert.equal((await teen('/me')).data.user.balance, 415000, 'nothing is charged until approved');
  overview = (await parent('/parent/overview')).data;
  await parent(`/parent/approvals/${overview.pending[0].id}`, { decision: 'approve' });
  assert.equal((await teen('/me')).data.user.balance, 335000);
  assert.match((await teen('/wallet/pay', { amount: 10000, merchant: 'PixelPlay', category: 'gaming', channel: 'online', pin: '4821' })).data.error.message, /blocked/);

  // Raising a limit needs approval; lowering is instant.
  const lower = await teen('/card', { dailyLimit: 100000 }, 'PATCH');
  assert.equal(lower.data.card.dailyLimit, 100000);
  const raise = await teen('/card', { dailyLimit: 400000 }, 'PATCH');
  assert.equal(raise.data.card.dailyLimit, 100000);
  assert.deepEqual(raise.data.requested, ['daily']);
  overview = (await parent('/parent/overview')).data;
  await parent(`/parent/approvals/${overview.pending[0].id}`, { decision: 'decline' });
  assert.equal((await teen('/card')).data.card.dailyLimit, 100000);

  // Parent lock beats the teen's own unfreeze.
  await parent(`/parent/children/${childId}/controls`, { parentLocked: true }, 'PATCH');
  assert.equal((await teen('/card', { frozen: false }, 'PATCH')).data.error.code, 'PARENT_LOCKED');
  assert.equal((await teen('/wallet/send', { amount: 1000, to: 'kabir@levelup', pin: '4821' })).data.error.code, 'LOCKED');

  const allowance = await parent(`/parent/children/${childId}/allowance`, { amount: 100000, frequency: 'weekly', active: true }, 'PUT');
  assert.ok(allowance.data.allowance.nextRun > Date.now());
  assert.equal((await parent(`/parent/children/${childId}/topup`, { amount: 20000 })).data.txn.balanceAfter, 355000);
});

test('account security', async () => {
  assert.equal((await teen('/me/pin', { pin: '7777' })).data.error.code, 'BAD_CREDENTIALS', 'changing a PIN needs the password');
  assert.equal((await teen('/me/password', { current: 'nope', next: 'new-password-1' })).status, 400);
  const second = client();
  await second('/auth/login', { email: 'teen@test.dev', password: 'password1' });
  assert.equal((await teen('/me/password', { current: 'password1', next: 'new-password-1' })).status, 200);
  assert.equal((await second('/dashboard')).status, 401, 'other sessions are revoked');
  assert.equal((await teen('/dashboard')).status, 200);
  await teen('/auth/logout', {});
  assert.equal((await teen('/dashboard')).status, 401);
});

import { getDB } from './database.js';

export function getOrCreateUser(userId, username) {
  const db = getDB();
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(userId, username);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  }
  return user;
}

export function autoResetIfNeeded(userId) {
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || user.plan === 'unlimited') return;

  const now = new Date();
  if (!user.last_claim) {
    db.prepare('UPDATE users SET credits = ?, last_claim = ? WHERE id = ?').run(user.max_daily_credits || 5, now.toISOString(), userId);
    return;
  }

  const lastReset = new Date(user.last_claim);
  const diffMs = now - lastReset;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours >= 24) {
    const maxCredits = user.max_daily_credits || 5;
    db.prepare('UPDATE users SET credits = ?, last_claim = ? WHERE id = ?').run(maxCredits, now.toISOString(), userId);
  }
}

export function isBlacklisted(userId) {
  const db = getDB();
  const user = db.prepare('SELECT blacklisted FROM users WHERE id = ?').get(userId);
  return user?.blacklisted === 1;
}

export function hasCredits(userId) {
  const db = getDB();
  autoResetIfNeeded(userId);
  const user = db.prepare('SELECT credits, plan FROM users WHERE id = ?').get(userId);
  if (!user) return false;
  if (user.plan === 'unlimited') return true;
  return user.credits > 0;
}

export function consumeCredit(userId) {
  const db = getDB();
  const user = db.prepare('SELECT credits, plan FROM users WHERE id = ?').get(userId);
  if (!user) return false;
  if (user.plan === 'unlimited') return true;
  if (user.credits <= 0) return false;
  db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ?').run(userId);
  return true;
}

export function addCredits(userId, amount) {
  const db = getDB();
  db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(amount, userId);
}

export function setUnlimited(userId) {
  const db = getDB();
  db.prepare("UPDATE users SET plan = 'unlimited', credits = 999999 WHERE id = ?").run(userId);
}

export function setFree(userId) {
  const db = getDB();
  db.prepare("UPDATE users SET plan = 'free', credits = 5, max_daily_credits = 5 WHERE id = ?").run(userId);
}

export function getUserInfo(userId, username) {
  autoResetIfNeeded(userId);
  return getOrCreateUser(userId, username);
}

export function isVipOrAdmin(member) {
  const db = getDB();
  const plans = db.prepare("SELECT role_id FROM plans WHERE unlimited = 1").all();
  for (const plan of plans) {
    if (member.roles.cache.has(plan.role_id)) return true;
  }
  return member.permissions.has(8n);
}

export function setPlanByRole(roleId, planName, dailyCredits, unlimited) {
  const db = getDB();
  db.prepare('INSERT OR REPLACE INTO plans (role_id, plan_name, daily_credits, unlimited) VALUES (?, ?, ?, ?)').run(roleId, planName, dailyCredits, unlimited ? 1 : 0);
}

export function getCreditsInfo(userId) {
  const db = getDB();
  autoResetIfNeeded(userId);
  const user = db.prepare('SELECT credits, plan, max_daily_credits, last_claim FROM users WHERE id = ?').get(userId);
  if (!user) return { credits: 5, plan: 'free', unlimited: false };
  if (user.plan === 'unlimited') return { credits: '♾️', plan: 'unlimited', unlimited: true };

  let nextReset = 'Inconnue';
  if (user.last_claim) {
    const next = new Date(new Date(user.last_claim).getTime() + 24 * 60 * 60 * 1000);
    nextReset = `<t:${Math.floor(next.getTime() / 1000)}:R>`;
  }

  return {
    credits: user.credits,
    plan: user.plan,
    unlimited: false,
    maxDaily: user.max_daily_credits || 5,
    nextReset
  };
}

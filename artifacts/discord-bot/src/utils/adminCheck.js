import { PermissionFlagsBits } from 'discord.js';
import { getDB } from './database.js';

const BOT_OWNER_ID = '594718632966357022';

export function isOwner(userId) {
  if (userId === BOT_OWNER_ID) return true;
  const db = getDB();
  const row = db.prepare('SELECT id FROM bot_owners WHERE user_id = ?').get(userId);
  return !!row;
}

export function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

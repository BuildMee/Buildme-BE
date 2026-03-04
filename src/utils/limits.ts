import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '../../data');
const LIMITS_FILE = path.join(DATA_DIR, 'daily-limits.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LIMITS_FILE)) fs.writeFileSync(LIMITS_FILE, '{}', 'utf-8');

/** userKey → date(YYYY-MM-DD) → count */
type LimitsStore = Record<string, Record<string, number>>;

const FREE_DAILY_LIMIT = 5;

function readLimits(): LimitsStore {
  try {
    return JSON.parse(fs.readFileSync(LIMITS_FILE, 'utf-8')) as LimitsStore;
  } catch {
    return {};
  }
}

function writeLimits(store: LimitsStore): void {
  fs.writeFileSync(LIMITS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

/** hdudwo GitHub 계정은 항상 무제한 */
export function isAdmin(userKey: string): boolean {
  return userKey === 'github:hdudwo';
}

/**
 * 오늘 생성 가능 여부를 확인하고, 가능하면 카운트를 1 증가시킵니다.
 * 어드민은 항상 allowed: true (카운트 미증가)
 */
export function checkAndIncrementDailyCount(userKey: string): { allowed: boolean; current: number } {
  if (isAdmin(userKey)) return { allowed: true, current: 0 };

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const store = readLimits();

  if (!store[userKey]) store[userKey] = {};
  const count = store[userKey][today] ?? 0;

  if (count >= FREE_DAILY_LIMIT) {
    return { allowed: false, current: count };
  }

  store[userKey][today] = count + 1;
  writeLimits(store);
  return { allowed: true, current: count + 1 };
}

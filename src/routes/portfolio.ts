import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const router = Router();

// 데이터 저장 경로
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'portfolios.json');
const SHARES_FILE = path.join(DATA_DIR, 'shares.json');

// 데이터 디렉토리/파일 초기화
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}', 'utf-8');
if (!fs.existsSync(SHARES_FILE)) fs.writeFileSync(SHARES_FILE, '{}', 'utf-8');

type PortfolioStore = Record<string, Portfolio[]>;

interface Portfolio {
  id: string;
  title: string;
  templateId: string;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

interface ShareEntry {
  token: string;
  title: string;
  templateId: string;
  data: unknown;
  createdAt: string;
  expiresAt: string; // 30일 후
}

type ShareStore = Record<string, ShareEntry>;

function readShares(): ShareStore {
  try {
    return JSON.parse(fs.readFileSync(SHARES_FILE, 'utf-8')) as ShareStore;
  } catch {
    return {};
  }
}

function writeShares(store: ShareStore): void {
  fs.writeFileSync(SHARES_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function readStore(): PortfolioStore {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as PortfolioStore;
  } catch {
    return {};
  }
}

function writeStore(store: PortfolioStore): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

/** Authorization 헤더에서 토큰으로 유저 키를 식별 */
async function getUserKey(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  // GitHub 시도
  try {
    const ghRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (ghRes.ok) {
      const user = await ghRes.json() as { login?: string };
      if (user.login) return `github:${user.login}`;
    }
  } catch { /* ignore */ }

  // Google 시도
  try {
    const gRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (gRes.ok) {
      const user = await gRes.json() as { sub?: string };
      if (user.sub) return `google:${user.sub}`;
    }
  } catch { /* ignore */ }

  return null;
}

/** POST /api/portfolio/save — 저장 */
router.post('/save', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userKey = await getUserKey(req.headers.authorization);
    if (!userKey) {
      res.status(401).json({ success: false, message: '인증이 필요합니다.' });
      return;
    }

    const { title, templateId, data } = req.body as { title?: string; templateId?: string; data?: unknown };
    if (!title || !templateId || !data) {
      res.status(400).json({ success: false, message: 'title, templateId, data가 필요합니다.' });
      return;
    }

    const store = readStore();
    if (!store[userKey]) store[userKey] = [];

    const now = new Date().toISOString();
    const portfolio: Portfolio = { id: randomUUID(), title, templateId, data, createdAt: now, updatedAt: now };
    store[userKey].push(portfolio);
    writeStore(store);

    res.json({ success: true, portfolio });
  } catch (err) {
    next(err);
  }
});

/** GET /api/portfolio/list — 목록 조회 */
router.get('/list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userKey = await getUserKey(req.headers.authorization);
    if (!userKey) {
      res.status(401).json({ success: false, message: '인증이 필요합니다.' });
      return;
    }

    const store = readStore();
    const portfolios = (store[userKey] ?? []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({ success: true, portfolios });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/portfolio/:id — 삭제 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userKey = await getUserKey(req.headers.authorization);
    if (!userKey) {
      res.status(401).json({ success: false, message: '인증이 필요합니다.' });
      return;
    }

    const { id } = req.params;
    const store = readStore();
    const list = store[userKey] ?? [];
    const idx = list.findIndex((p) => p.id === id);

    if (idx === -1) {
      res.status(404).json({ success: false, message: '포트폴리오를 찾을 수 없습니다.' });
      return;
    }

    list.splice(idx, 1);
    store[userKey] = list;
    writeStore(store);

    res.json({ success: true, message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/portfolio/:id — 수정 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userKey = await getUserKey(req.headers.authorization);
    if (!userKey) {
      res.status(401).json({ success: false, message: '인증이 필요합니다.' });
      return;
    }

    const { id } = req.params;
    const { title, templateId, data } = req.body as { title?: string; templateId?: string; data?: unknown };
    if (!title || !templateId || !data) {
      res.status(400).json({ success: false, message: 'title, templateId, data가 필요합니다.' });
      return;
    }

    const store = readStore();
    const list = store[userKey] ?? [];
    const idx = list.findIndex((p) => p.id === id);

    if (idx === -1) {
      res.status(404).json({ success: false, message: '포트폴리오를 찾을 수 없습니다.' });
      return;
    }

    list[idx] = { ...list[idx], title, templateId, data, updatedAt: new Date().toISOString() };
    store[userKey] = list;
    writeStore(store);

    res.json({ success: true, portfolio: list[idx] });
  } catch (err) {
    next(err);
  }
});

/** POST /api/portfolio/share — 공유 링크 생성 (로그인 필요) */
router.post('/share', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userKey = await getUserKey(req.headers.authorization);
    if (!userKey) {
      res.status(401).json({ success: false, message: '인증이 필요합니다.' });
      return;
    }

    const { title, templateId, data } = req.body as { title?: string; templateId?: string; data?: unknown };
    if (!templateId || !data) {
      res.status(400).json({ success: false, message: 'templateId, data가 필요합니다.' });
      return;
    }

    const token = randomUUID().replace(/-/g, '');
    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30일

    const entry: ShareEntry = {
      token,
      title: title ?? '포트폴리오',
      templateId,
      data,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };

    const shares = readShares();
    shares[token] = entry;
    writeShares(shares);

    res.json({ success: true, token });
  } catch (err) {
    next(err);
  }
});

/** GET /api/portfolio/public/:token — 공개 조회 (인증 불필요) */
router.get('/public/:token', (req: Request, res: Response) => {
  const { token } = req.params;
  const shares = readShares();
  const entry = shares[token];

  if (!entry) {
    res.status(404).json({ success: false, message: '공유 링크가 존재하지 않거나 만료됐습니다.' });
    return;
  }

  if (new Date(entry.expiresAt) < new Date()) {
    // 만료된 항목 정리
    delete shares[token];
    writeShares(shares);
    res.status(404).json({ success: false, message: '공유 링크가 만료됐습니다.' });
    return;
  }

  res.json({ success: true, title: entry.title, templateId: entry.templateId, data: entry.data });
});

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const router = Router();

// 데이터 저장 경로
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'portfolios.json');

// 데이터 디렉토리/파일 초기화
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}', 'utf-8');

type PortfolioStore = Record<string, Portfolio[]>;

interface Portfolio {
  id: string;
  title: string;
  templateId: string;
  data: unknown;
  createdAt: string;
  updatedAt: string;
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

export default router;

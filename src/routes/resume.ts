import { Router, Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const router = Router();

// 파일 저장 경로
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const DATA_DIR = path.join(__dirname, '../../data');
const RESUMES_FILE = path.join(DATA_DIR, 'resumes.json');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RESUMES_FILE)) fs.writeFileSync(RESUMES_FILE, '{}', 'utf-8');

interface ResumeEntry {
  id: string;
  fileName: string;
  storedPath: string;
  uploadedAt: string;
}

type ResumeStore = Record<string, ResumeEntry[]>;

function readStore(): ResumeStore {
  try {
    return JSON.parse(fs.readFileSync(RESUMES_FILE, 'utf-8')) as ResumeStore;
  } catch {
    return {};
  }
}

function writeStore(store: ResumeStore): void {
  fs.writeFileSync(RESUMES_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

async function getUserKey(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  try {
    const ghRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (ghRes.ok) {
      const user = await ghRes.json() as { login?: string };
      if (user.login) return `github:${user.login}`;
    }
  } catch { /* ignore */ }

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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

function pdfFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('PDF 파일만 업로드 가능합니다.'));
  }
}

const upload = multer({
  storage,
  fileFilter: pdfFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/** POST /api/resume/upload */
router.post('/upload', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' });
      return;
    }

    const { name, role } = req.body as { name?: string; role?: string };
    if (!name || !role) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ success: false, message: '이름과 직군은 필수입니다.' });
      return;
    }

    const userKey = await getUserKey(req.headers.authorization);
    if (!userKey) {
      fs.unlinkSync(req.file.path);
      res.status(401).json({ success: false, message: '인증이 필요합니다.' });
      return;
    }

    const entry: ResumeEntry = {
      id: randomUUID(),
      fileName: req.file.originalname,
      storedPath: req.file.filename,
      uploadedAt: new Date().toISOString(),
    };

    const store = readStore();
    if (!store[userKey]) store[userKey] = [];
    store[userKey].push(entry);
    writeStore(store);

    res.json({
      success: true,
      message: '이력서가 성공적으로 업로드되었습니다.',
      resume: entry,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/resume/list */
router.get('/list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userKey = await getUserKey(req.headers.authorization);
    if (!userKey) {
      res.status(401).json({ success: false, message: '인증이 필요합니다.' });
      return;
    }

    const store = readStore();
    const resumes = (store[userKey] ?? []).sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );

    res.json({ success: true, resumes });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/resume/:id */
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
    const idx = list.findIndex((r) => r.id === id);

    if (idx === -1) {
      res.status(404).json({ success: false, message: '이력서를 찾을 수 없습니다.' });
      return;
    }

    const [removed] = list.splice(idx, 1);
    store[userKey] = list;
    writeStore(store);

    // 실제 파일도 삭제
    const filePath = path.join(UPLOAD_DIR, removed.storedPath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ success: true, message: '삭제되었습니다.' });
  } catch (err) {
    next(err);
  }
});

export default router;

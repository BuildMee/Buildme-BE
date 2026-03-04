import { Router, Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { checkAndIncrementDailyCount, isAdmin } from '../utils/limits';
import { PDFParse } from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

// AI 설정
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

interface PortfolioData {
  name: string;
  role: string;
  intro: string;
  skills: string[];
  projects: { name: string; description: string; tech: string[]; highlights: string }[];
  summary: string;
  github?: string;
  blog?: string;
}

/** PDF 텍스트 추출 → AI 분석 → PortfolioData 반환 */
async function analyzeResume(filePath: string, name: string, role: string): Promise<PortfolioData> {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  const text = parsed.text.slice(0, 15000);

  const prompt = `당신은 이력서 분석 전문가입니다. 아래 이력서 텍스트를 분석해 포트폴리오 초안을 한국어로 작성해주세요.

이름: ${name}
직군: ${role}

이력서 내용:
${text}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "name": "${name}",
  "role": "${role}",
  "intro": "이력서를 바탕으로 작성한 2~3문장 자기소개",
  "skills": ["이력서에서 추출한 기술1", "기술2", "기술3"],
  "projects": [
    {
      "name": "프로젝트명",
      "description": "2~3문장 프로젝트 설명",
      "tech": ["사용 기술1", "기술2"],
      "highlights": "핵심 성과나 특징 한 줄"
    }
  ],
  "summary": "전체 포트폴리오 한 줄 요약",
  "github": "GitHub URL (있으면)",
  "blog": "블로그 URL (있으면)"
}`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답 파싱 실패');
  return JSON.parse(jsonMatch[0]) as PortfolioData;
}

/** AI 분석 실패 시 기본 포트폴리오 초안 반환 */
function buildFallbackPortfolio(name: string, role: string): PortfolioData {
  return {
    name,
    role,
    intro: `${name}입니다. ${role} 분야에서 활동하고 있습니다. 이력서를 기반으로 포트폴리오를 작성해주세요.`,
    skills: [],
    projects: [],
    summary: `${role} ${name}의 포트폴리오`,
  };
}

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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
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

    // 무료 플랜: 이력서 1개 제한
    if (!isAdmin(userKey)) {
      const existingStore = readStore();
      if ((existingStore[userKey]?.length ?? 0) >= 1) {
        fs.unlinkSync(req.file.path);
        res.status(429).json({
          success: false,
          code: 'RESUME_LIMIT',
          message: '무료 플랜은 이력서를 1개만 업로드할 수 있습니다. 기존 이력서를 삭제하거나 Pro로 업그레이드하세요.',
        });
        return;
      }
    }

    // 무료 플랜: 하루 포트폴리오 생성 5개 제한 (이력서 업로드도 포함)
    const { allowed } = checkAndIncrementDailyCount(userKey);
    if (!allowed) {
      fs.unlinkSync(req.file.path);
      res.status(429).json({
        success: false,
        code: 'DAILY_LIMIT',
        message: '하루 포트폴리오 생성 5개 제한을 초과했습니다. Pro로 업그레이드하세요.',
      });
      return;
    }

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    const entry: ResumeEntry = {
      id: randomUUID(),
      fileName: originalName,
      storedPath: req.file.filename,
      uploadedAt: new Date().toISOString(),
    };

    const store = readStore();
    if (!store[userKey]) store[userKey] = [];
    store[userKey].push(entry);
    writeStore(store);

    // PDF 텍스트 추출 → AI 분석
    let portfolio: PortfolioData;
    let fallback = false;
    try {
      portfolio = await analyzeResume(req.file.path, name, role);
    } catch {
      portfolio = buildFallbackPortfolio(name, role);
      fallback = true;
    }

    res.json({
      success: true,
      message: '이력서가 성공적으로 업로드되었습니다.',
      resume: entry,
      portfolio,
      fallback,
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

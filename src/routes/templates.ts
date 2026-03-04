import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const router = Router();

// 제출 데이터 저장 경로
const DATA_DIR = path.join(__dirname, '../../data');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SUBMISSIONS_FILE)) fs.writeFileSync(SUBMISSIONS_FILE, '[]', 'utf-8');

interface Submission {
  id: string;
  name: string;
  category: string;
  description: string;
  previewUrl: string;
  githubUrl: string;
  author: string;
  tags: string[];
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

function readSubmissions(): Submission[] {
  try {
    return JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf-8')) as Submission[];
  } catch {
    return [];
  }
}

function writeSubmissions(list: Submission[]): void {
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  url: string;
  author: string;
  likes: number;
  createdAt: string;
}

// 인메모리 저장소 (DB 연동 전 임시 사용)
const templates: Template[] = [
  {
    id: '1',
    name: 'Neo Brutalist',
    category: 'creative',
    description: '굵은 테두리와 강렬한 타이포그래피가 특징인 브루탈리스트 디자인',
    tags: ['brutalist', 'bold', 'creative'],
    url: 'https://example.com/neo-brutalist',
    author: '@dev_kim',
    likes: 234,
    createdAt: '2025-01-15T00:00:00.000Z',
  },
  {
    id: '2',
    name: 'Terminal',
    category: 'tech',
    description: '터미널 스타일의 포트폴리오. 개발자 감성 최강',
    tags: ['terminal', 'dark', 'tech'],
    url: 'https://example.com/terminal',
    author: '@parkjiwon',
    likes: 189,
    createdAt: '2025-01-20T00:00:00.000Z',
  },
  {
    id: '3',
    name: 'Minimal Dark',
    category: 'dark',
    description: '다크 배경에 모노스페이스 폰트로 군더더기 없는 레이아웃',
    tags: ['minimal', 'dark', 'monospace'],
    url: 'https://example.com/minimal-dark',
    author: '@leesung',
    likes: 156,
    createdAt: '2025-02-01T00:00:00.000Z',
  },
];

/**
 * GET /api/templates
 * 커뮤니티 템플릿 목록을 반환합니다.
 *
 * Query: ?sort=popular|newest&category=all|minimal|dark|creative|tech
 */
router.get('/', (req: Request, res: Response) => {
  const sort = (req.query['sort'] as string) || 'popular';
  const category = (req.query['category'] as string) || 'all';

  let result = [...templates];

  if (category !== 'all') {
    result = result.filter((t) => t.category === category);
  }

  if (sort === 'popular') {
    result.sort((a, b) => b.likes - a.likes);
  } else {
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  res.json({ success: true, templates: result });
});

/**
 * POST /api/templates
 * 새 커뮤니티 템플릿을 등록합니다.
 *
 * Body: { name, category, description, tags, url }
 */
router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, category, description, tags, url } = req.body as {
      name?: string;
      category?: string;
      description?: string;
      tags?: string | string[];
      url?: string;
    };

    if (!name || !category || !description || !url) {
      res.status(400).json({
        success: false,
        message: '이름, 카테고리, 설명, URL은 필수입니다.',
      });
      return;
    }

    const parsedTags: string[] =
      typeof tags === 'string'
        ? tags.split(',').map((t) => t.trim()).filter(Boolean)
        : Array.isArray(tags)
          ? tags
          : [];

    const newTemplate: Template = {
      id: String(Date.now()),
      name,
      category,
      description,
      tags: parsedTags,
      url,
      author: '@anonymous',
      likes: 0,
      createdAt: new Date().toISOString(),
    };

    templates.push(newTemplate);

    res.status(201).json({ success: true, template: newTemplate });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/templates/:id/like
 * 템플릿에 좋아요를 추가합니다.
 */
router.post('/:id/like', (req: Request, res: Response) => {
  const template = templates.find((t) => t.id === req.params['id']);

  if (!template) {
    res.status(404).json({ success: false, message: '템플릿을 찾을 수 없습니다.' });
    return;
  }

  template.likes += 1;
  res.json({ success: true, likes: template.likes });
});

/**
 * POST /api/templates/submit
 * 템플릿 제출 (인증 불필요, 검토 후 등록)
 *
 * Body: { name, category, description, previewUrl, githubUrl, author, tags }
 */
router.post('/submit', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, category, description, previewUrl, githubUrl, author, tags } = req.body as {
      name?: string;
      category?: string;
      description?: string;
      previewUrl?: string;
      githubUrl?: string;
      author?: string;
      tags?: string;
    };

    if (!name || !category || !description || !author) {
      res.status(400).json({ success: false, message: '이름, 카테고리, 설명, 작성자는 필수입니다.' });
      return;
    }

    const parsedTags = tags
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const submission: Submission = {
      id: randomUUID(),
      name,
      category,
      description,
      previewUrl: previewUrl ?? '',
      githubUrl: githubUrl ?? '',
      author,
      tags: parsedTags,
      status: 'pending',
      submittedAt: new Date().toISOString(),
    };

    const list = readSubmissions();
    list.push(submission);
    writeSubmissions(list);

    res.status(201).json({ success: true, submission });
  } catch (err) {
    next(err);
  }
});

/** 어드민 인증: hdudwo GitHub 계정만 허용 */
async function requireAdmin(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return false;
    const user = await res.json() as { login?: string };
    return user.login === 'hdudwo';
  } catch {
    return false;
  }
}

/**
 * GET /api/templates/submissions
 * 어드민 전용: 전체 제출 목록 조회
 */
router.get('/submissions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isAdmin = await requireAdmin(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ success: false, message: '어드민 권한이 필요합니다.' });
      return;
    }
    const status = req.query['status'] as string | undefined;
    let list = readSubmissions();
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      list = list.filter((s) => s.status === status);
    }
    list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    res.json({ success: true, submissions: list });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/templates/submissions/:id
 * 어드민 전용: 제출 상태 변경 (approved / rejected)
 */
router.patch('/submissions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isAdmin = await requireAdmin(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ success: false, message: '어드민 권한이 필요합니다.' });
      return;
    }
    const { id } = req.params;
    const { status } = req.body as { status?: string };
    if (!status || !['approved', 'rejected', 'pending'].includes(status)) {
      res.status(400).json({ success: false, message: '유효하지 않은 상태값입니다.' });
      return;
    }
    const list = readSubmissions();
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) {
      res.status(404).json({ success: false, message: '제출을 찾을 수 없습니다.' });
      return;
    }
    list[idx].status = status as Submission['status'];
    writeSubmissions(list);
    res.json({ success: true, submission: list[idx] });
  } catch (err) {
    next(err);
  }
});

export default router;

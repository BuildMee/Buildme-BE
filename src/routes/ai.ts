import { Router, Request, Response, NextFunction } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// ── 나중에 GPT로 전환할 때 ──────────────────────────────────────
// 1) npm install openai
// 2) 위 3줄을 아래로 교체
// import OpenAI from 'openai';
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// 3) generateText() 함수 내부만 수정 (아래 주석 참고)
// ──────────────────────────────────────────────────────────────

/** 429 할당량 초과 여부 판별 */
function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
}

async function generateText(prompt: string): Promise<string> {
  // ── Gemini ──
  const result = await model.generateContent(prompt);
  return result.response.text();

  // ── GPT로 전환 시 위 두 줄 대신 아래 사용 ──
  // const res = await openai.chat.completions.create({
  //   model: 'gpt-4o-mini',
  //   messages: [{ role: 'user', content: prompt }],
  //   max_tokens: 2048,
  // });
  // return res.choices[0].message.content ?? '';
}

// ── 할당량 초과 시 반환할 폴백 디자인 목록 ──────────────────────
const FALLBACK_DESIGNS = [
  {
    theme: 'dark', primaryColor: '#e2e8f0', accentColor: '#60a5fa',
    backgroundColor: '#0f172a', textColor: '#cbd5e1',
    fontStyle: 'monospace', layout: 'minimal',
    mood: '세련되고 집중된, 미니멀한 개발자 감성',
  },
  {
    theme: 'light', primaryColor: '#111827', accentColor: '#6366f1',
    backgroundColor: '#ffffff', textColor: '#374151',
    fontStyle: 'sans-serif', layout: 'grid',
    mood: '깔끔하고 현대적인, 그리드 기반의 레이아웃',
  },
  {
    theme: 'dark', primaryColor: '#f8fafc', accentColor: '#a855f7',
    backgroundColor: '#09090b', textColor: '#e4e4e7',
    fontStyle: 'sans-serif', layout: 'minimal',
    mood: '강렬하고 개성 있는, 네온 포인트의 다크 테마',
  },
  {
    theme: 'light', primaryColor: '#1e293b', accentColor: '#f59e0b',
    backgroundColor: '#fdf6ec', textColor: '#334155',
    fontStyle: 'serif', layout: 'magazine',
    mood: '고급스럽고 에디토리얼한, 매거진 스타일',
  },
  {
    theme: 'dark', primaryColor: '#4ade80', accentColor: '#22d3ee',
    backgroundColor: '#0d1117', textColor: '#c9d1d9',
    fontStyle: 'monospace', layout: 'terminal',
    mood: '해커 감성의 터미널 스타일 개발자 포트폴리오',
  },
];

function pickFallbackDesign(prompt: string) {
  const p = prompt.toLowerCase();
  if (p.includes('terminal') || p.includes('해커') || p.includes('터미널')) return FALLBACK_DESIGNS[4];
  if (p.includes('magazine') || p.includes('매거진') || p.includes('에디토리얼')) return FALLBACK_DESIGNS[3];
  if (p.includes('grid') || p.includes('그리드') || p.includes('밝') || p.includes('화이트')) return FALLBACK_DESIGNS[1];
  if (p.includes('네온') || p.includes('neon') || p.includes('보라')) return FALLBACK_DESIGNS[2];
  return FALLBACK_DESIGNS[0]; // dark minimal 기본
}

/**
 * POST /api/ai/generate
 * 사용자 설명을 받아 포트폴리오 디자인 스타일을 생성합니다.
 */
router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt } = req.body as { prompt?: string };
    if (!prompt) {
      res.status(400).json({ success: false, message: '디자인 설명을 입력해주세요.' });
      return;
    }

    try {
      const text = await generateText(
        `당신은 포트폴리오 디자인 전문가입니다. 사용자의 설명을 바탕으로 포트폴리오 디자인 스타일을 JSON으로 생성해주세요.

사용자 설명: "${prompt}"

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "theme": "light" | "dark",
  "primaryColor": "#hex색상",
  "accentColor": "#hex색상",
  "backgroundColor": "#hex색상",
  "textColor": "#hex색상",
  "fontStyle": "serif" | "sans-serif" | "monospace",
  "layout": "minimal" | "grid" | "magazine" | "terminal",
  "mood": "한 줄로 표현한 분위기 설명"
}`
      );

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        res.status(500).json({ success: false, message: 'AI 응답 파싱 오류' });
        return;
      }

      const design = JSON.parse(jsonMatch[0]);
      res.json({ success: true, design });
    } catch (aiErr) {
      if (isQuotaError(aiErr)) {
        // 할당량 초과 → 폴백 디자인 반환
        const design = pickFallbackDesign(prompt);
        res.json({ success: true, design, fallback: true });
      } else {
        throw aiErr;
      }
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/generate-portfolio
 * 선택된 레포 정보들을 분석해 포트폴리오 초안을 생성합니다.
 */
interface RepoDetail {
  name: string;
  description: string;
  languages: string[];
  topics: string[];
  stars: number;
  commitCount: number;
  readme: string;
  role?: string;
  highlights?: string;
}

router.post('/generate-portfolio', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userName, major, repos, extraInfo } = req.body as {
      userName?: string;
      major?: string;
      repos?: RepoDetail[];
      extraInfo?: { awards?: string; certifications?: string; activities?: string; additional?: string };
    };

    if (!repos || repos.length === 0) {
      res.status(400).json({ success: false, message: '레포지토리를 선택해주세요.' });
      return;
    }

    const repoSummary = repos.map((r) => `
- 프로젝트명: ${r.name}
  설명: ${r.description || '없음'}
  기술스택: ${r.languages.join(', ') || '없음'}
  태그: ${r.topics.join(', ') || '없음'}
  커밋 수: ${r.commitCount}
  스타: ${r.stars}
  내 역할: ${r.role || '없음'}
  특징/포인트: ${r.highlights || '없음'}
  README 요약: ${r.readme.slice(0, 500) || '없음'}
`).join('\n');

    const extraSection = extraInfo ? `
추가 정보:
  수상 내역: ${extraInfo.awards || '없음'}
  자격증/수료: ${extraInfo.certifications || '없음'}
  대외 활동/기여: ${extraInfo.activities || '없음'}
  강조 사항: ${extraInfo.additional || '없음'}
` : '';

    try {
      const text = await generateText(
        `당신은 개발자 포트폴리오 작성 전문가입니다. GitHub 레포지토리 정보를 분석해서 포트폴리오 초안을 한국어로 작성해주세요.

개발자 이름: ${userName || '개발자'}
전공/분야: ${major || '미입력'}

레포지토리 정보:
${repoSummary}
${extraSection}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "intro": "2~3문장의 자기소개",
  "skills": ["기술1", "기술2", "기술3"],
  "projects": [
    {
      "name": "프로젝트명",
      "description": "2~3문장 프로젝트 설명",
      "tech": ["기술1", "기술2"],
      "highlights": "핵심 성과나 특징 한 줄"
    }
  ],
  "summary": "전체 포트폴리오 한 줄 요약"
}`
      );

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        res.status(500).json({ success: false, message: 'AI 응답 파싱 오류' });
        return;
      }

      const portfolio = JSON.parse(jsonMatch[0]);
      res.json({ success: true, portfolio });
    } catch (aiErr) {
      if (isQuotaError(aiErr)) {
        // 할당량 초과 → 레포 정보 기반 폴백 생성
        const repoNames = repos.map(r => r.name);
        const allLangs = [...new Set(repos.flatMap(r => r.languages))];
        const portfolio = {
          intro: `${userName || '개발자'}는 ${major || '개발'}을 전공한 개발자입니다. ${repoNames.slice(0, 2).join(', ')} 등의 프로젝트를 진행하며 실력을 쌓았습니다. 문제 해결과 코드 품질에 높은 관심을 가지고 있습니다.`,
          skills: allLangs.slice(0, 8).length > 0 ? allLangs.slice(0, 8) : ['JavaScript', 'TypeScript', 'React', 'Node.js'],
          projects: repos.slice(0, 4).map(r => ({
            name: r.name,
            description: r.description || `${r.name} 프로젝트입니다. ${r.languages.join(', ')} 기술을 활용하여 개발하였습니다.`,
            tech: r.languages.slice(0, 4),
            highlights: r.highlights || `커밋 ${r.commitCount}회, ⭐ ${r.stars}`,
          })),
          summary: `${allLangs.slice(0, 3).join(', ')} 기반의 ${major || '개발자'} ${userName || ''}의 포트폴리오`,
        };
        res.json({ success: true, portfolio, fallback: true });
      } else {
        throw aiErr;
      }
    }
  } catch (err) {
    next(err);
  }
});

export default router;

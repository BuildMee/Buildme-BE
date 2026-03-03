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
  } catch (err) {
    next(err);
  }
});

export default router;

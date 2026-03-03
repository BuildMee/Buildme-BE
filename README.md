<div align="center">

# 🛠️ Buildme — Backend

**AI 기반 포트폴리오 생성 서비스 API 서버**

<br/>

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)

</div>

---

## 📌 소개

**Buildme Backend**는 포트폴리오 저장/편집/공유, 이력서 관리, GitHub OAuth, AI 포트폴리오 생성 기능을 제공하는 REST API 서버입니다.

---

## 📡 API 목록

### 🔐 Auth
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/auth/github` | GitHub OAuth 리다이렉트 |
| GET | `/api/auth/github/callback` | GitHub OAuth 콜백 |
| GET | `/api/auth/me` | 내 정보 조회 |

### 📁 Portfolio
| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| POST | `/api/portfolio/save` | ✅ | 포트폴리오 저장 |
| GET | `/api/portfolio/list` | ✅ | 내 포트폴리오 목록 |
| PUT | `/api/portfolio/:id` | ✅ | 포트폴리오 수정 |
| DELETE | `/api/portfolio/:id` | ✅ | 포트폴리오 삭제 |
| POST | `/api/portfolio/share` | ✅ | 공유 링크 생성 (30일) |
| GET | `/api/portfolio/public/:token` | ❌ | 공유 포트폴리오 조회 |

### 📄 Resume
| Method | Endpoint | 인증 | 설명 |
|--------|----------|------|------|
| POST | `/api/resume/upload` | ✅ | PDF 이력서 업로드 |
| GET | `/api/resume/list` | ✅ | 내 이력서 목록 |
| DELETE | `/api/resume/:id` | ✅ | 이력서 삭제 |

### 🤖 AI
| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/ai/generate` | AI 포트폴리오 데이터 생성 |
| POST | `/api/ai/design` | AI 커스텀 디자인 생성 |

### 🐙 GitHub
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/github/repos` | GitHub 레포지토리 목록 |
| POST | `/api/github/analyze` | 레포 분석 → 포트폴리오 생성 |

---

## 🗂️ 프로젝트 구조

```
be/
├── src/
│   ├── routes/
│   │   ├── auth.ts        # GitHub/Google OAuth
│   │   ├── portfolio.ts   # 포트폴리오 CRUD + 공유
│   │   ├── resume.ts      # 이력서 업로드/목록/삭제
│   │   ├── ai.ts          # AI 생성 (Claude / Gemini)
│   │   ├── github.ts      # GitHub 레포 분석
│   │   └── templates.ts   # 템플릿 목록
│   ├── middleware/
│   │   └── errorHandler.ts
│   └── index.ts           # 서버 엔트리포인트
├── data/
│   ├── portfolios.json    # 포트폴리오 저장소
│   ├── shares.json        # 공유 링크 저장소
│   └── resumes.json       # 이력서 메타데이터
└── uploads/               # 업로드된 PDF 파일
```

---

## ⚙️ 기술 스택

| 분류 | 기술 |
|------|------|
| 언어 | TypeScript |
| 프레임워크 | Express.js |
| AI | Claude (Anthropic SDK), Gemini |
| 파일 업로드 | Multer |
| 데이터 저장 | JSON 파일 기반 |

---

## 🚀 시작하기

### 1. 설치

```bash
git clone https://github.com/BuildMee/Buildme-BE.git
cd Buildme-BE
npm install
```

### 2. 환경변수 설정

`.env` 파일을 생성합니다:

```env
PORT=3001
CORS_ORIGIN=http://localhost:5173

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# AI (선택)
ANTHROPIC_API_KEY=your_anthropic_api_key
GEMINI_API_KEY=your_gemini_api_key
```

### 3. 개발 서버 실행

```bash
npm run dev
```

서버가 `http://localhost:3001`에서 실행됩니다.

> [!NOTE]
> 프론트엔드 [Buildme-FE](https://github.com/BuildMee/Buildme-FE)와 함께 사용합니다.

---

## 🔗 관련 레포지토리

- **Frontend** → [Buildme-FE](https://github.com/BuildMee/Buildme-FE)

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/BuildMee">BuildMee</a></sub>
</div>

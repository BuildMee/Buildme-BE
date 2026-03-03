import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

/**
 * GET /api/github/repos
 * 인증된 사용자의 GitHub 레포지토리 목록을 반환합니다.
 *
 * Header: Authorization: Bearer <access_token>
 * Query:  ?sort=updated&per_page=30
 */
router.get('/repos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: '인증 토큰이 필요합니다.' });
      return;
    }

    const token = authHeader.slice(7);
    const sort = (req.query['sort'] as string) || 'updated';
    const perPage = (req.query['per_page'] as string) || '30';

    const reposRes = await fetch(
      `https://api.github.com/user/repos?sort=${sort}&per_page=${perPage}&type=owner`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      },
    );

    if (!reposRes.ok) {
      res.status(reposRes.status).json({ success: false, message: 'GitHub API 호출 실패' });
      return;
    }

    const repos = await reposRes.json() as Array<{
      id: number;
      name: string;
      full_name: string;
      description: string | null;
      html_url: string;
      language: string | null;
      stargazers_count: number;
      updated_at: string;
      private: boolean;
    }>;

    const simplified = repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      url: r.html_url,
      language: r.language,
      stars: r.stargazers_count,
      updatedAt: r.updated_at,
      isPrivate: r.private,
      owner: 'user' as const,
    }));

    // 소속 조직 목록 가져오기
    const orgsRes = await fetch('https://api.github.com/user/orgs', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    const orgs = orgsRes.ok
      ? await orgsRes.json() as Array<{ login: string; avatar_url: string }>
      : [];

    // 각 조직의 레포 가져오기
    const orgReposArrays = await Promise.all(
      orgs.map(async (org) => {
        const res = await fetch(
          `https://api.github.com/orgs/${org.login}/repos?sort=updated&per_page=30`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
        );
        if (!res.ok) return [];
        const orgRepos = await res.json() as Array<{
          id: number; name: string; full_name: string;
          description: string | null; html_url: string;
          language: string | null; stargazers_count: number;
          updated_at: string; private: boolean;
        }>;
        return orgRepos.map((r) => ({
          id: r.id,
          name: r.name,
          fullName: r.full_name,
          description: r.description,
          url: r.html_url,
          language: r.language,
          stars: r.stargazers_count,
          updatedAt: r.updated_at,
          isPrivate: r.private,
          owner: org.login,
        }));
      })
    );

    const allRepos = [...simplified, ...orgReposArrays.flat()];
    res.json({ success: true, repos: allRepos, orgs: orgs.map((o) => o.login) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/github/repo-detail/:owner/:repo
 * 레포지토리 상세 정보 (README, 언어, 커밋 수) 수집
 */
router.get('/repo-detail/:owner/:repo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: '인증 토큰이 필요합니다.' });
      return;
    }

    const token = authHeader.slice(7);
    const { owner, repo } = req.params as { owner: string; repo: string };
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    };

    const [repoRes, languagesRes, commitsRes, readmeRes] = await Promise.allSettled([
      fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers }),
    ]);

    const repoData = repoRes.status === 'fulfilled' && repoRes.value.ok
      ? await repoRes.value.json() as { description: string | null; stargazers_count: number; forks_count: number; topics: string[] }
      : null;

    const languages = languagesRes.status === 'fulfilled' && languagesRes.value.ok
      ? await languagesRes.value.json() as Record<string, number>
      : {};

    let commitCount = 0;
    if (commitsRes.status === 'fulfilled' && commitsRes.value.ok) {
      const linkHeader = commitsRes.value.headers.get('link') ?? '';
      const match = linkHeader.match(/page=(\d+)>; rel="last"/);
      commitCount = match ? parseInt(match[1]) : 1;
    }

    let readme = '';
    if (readmeRes.status === 'fulfilled' && readmeRes.value.ok) {
      const readmeData = await readmeRes.value.json() as { content: string };
      readme = Buffer.from(readmeData.content, 'base64').toString('utf-8').slice(0, 2000);
    }

    res.json({
      success: true,
      detail: {
        name: repo,
        owner,
        description: repoData?.description ?? '',
        stars: repoData?.stargazers_count ?? 0,
        forks: repoData?.forks_count ?? 0,
        topics: repoData?.topics ?? [],
        languages: Object.keys(languages),
        commitCount,
        readme,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

# Heinapel War Table

WB 헤이나펄 리그 2기 30인 작전판. 지도 위에 선수를 배치하고 장면별 작전을 짜며,
선수마다 임무 카드와 폰용 임무 확인 화면을 보여 준다.
vinext(Next 호환) + React 19, Cloudflare Workers 형태로 배포한다.

## 구조

- `app/roster.ts` — 명단·전투 위치 번호·임무 브리프의 단일 출처
- `app/war-table.tsx` — 작전판, 폰 화면, 명단·임무 편집기
- `app/globals.css`, `app/mdt-theme.css` — 기본 배치와 그 위에 덮는 테마 (이 순서로 불러온다)
- `cards/build.mjs` — 임무 카드 PNG 생성기 (`CHROME_PATH`로 크롬 위치 지정 가능)
- `tests/rendered-html.test.mjs` — 서버 렌더 HTML과 명단 이관 테스트
- `harness/` — 에이전트 작업 상태(`PROGRESS.md`)와 작업 단위(`FEATURES.md`)
- `worker/`, `vite.config.ts`, `db/`, `drizzle.config.ts` — 호스팅 템플릿 구성. 앱은 DB를 쓰지 않는다.

## 명령

Node.js `>=22.13.0`.

```bash
npm ci
npm run dev     # 개발 서버
npm run lint
npm test        # 빌드 후 tests/rendered-html.test.mjs
```

작전 상태는 브라우저 localStorage(`heinapel-war-table-v0.3`)에 저장되고,
다른 기기에는 JSON 내보내기·가져오기로 옮긴다.

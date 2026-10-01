# Heinapel War Table

WB 헤이나펄 리그 2기 30인 작전판. 지도 위에 선수를 배치하고 장면별 작전을 짜며,
폰으로 열면 주전 30명 명단과 사람별 임무 카드를 보여 준다.
vinext(Next 호환) + React 19, Cloudflare Workers 형태로 배포한다.

## 구조

- `app/roster.ts` — 명단·전투 위치 번호의 단일 출처
- `app/war-table.tsx` — 작전판, 폰 화면, 명단·임무 편집기
- `app/globals.css`, `app/mdt-theme.css` — 기본 배치와 그 위에 덮는 테마 (이 순서로 불러온다)
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

폰 화면 임무는 구글 시트 [WB ROW League 스타팅 포인트 30명](https://docs.google.com/spreadsheets/d/1NUorQ8zecl1mDRstKk-F1T7hRF2YYBgS_ZG21gIvcgc/edit)의
`스타팅 명단` 탭에서 읽는다. 시트는 "링크가 있는 모든 사용자 · 뷰어"로 공유해야 하고,
머리글(스타팅 포인트 번호·닉네임·소속팀·메인임무·서브임무·1~5번부대) 이름은 바꾸지 않는다.
메인·서브·부대가 모두 비면 카드에 "임무 준비 중"으로 나온다.

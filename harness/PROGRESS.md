# 진행 상황

갱신: 2026-09-02 (하네스 초기 작성 — 조율자)

## 현재 상태

- 브랜치 `main`, 워킹트리 clean, `origin/main`(github.com/formars0309-cloud/wb-row-league)과 동기화됨.
- 원본 이력 이전 완료. 조율자 확인 기준으로 lint·build·tests 모두 통과 상태.
- 최신 커밋 `02654a0` — 팀원이 폰으로 자기 명령을 읽는 뷰 추가.

## 마지막으로 한 일

- 팀원용 폰 화면 추가(02654a0), 전투 위치 번호 일괄 배치(6e0c7b6), 보드 대칭화(75ffbf3),
  입구 막기 명령의 목적지를 적 진영 입구로 교정(81189d6) 등 작전판 기능 마무리.
- 이 하네스 폴더(`harness/`) 신설. 코드에는 손대지 않음.

## 다음 세션이 할 일

1. `npm test`와 `npm run lint`를 돌려 기존 기능이 깨지지 않았는지 확인한다.
2. `FEATURES.md`의 남은 단위가 비어 있으므로, 새 일감은 조율자가 추가할 때까지 착수하지
   않는다. 임의로 기능을 추가하지 말 것.
3. 참고: 폰 화면(02654a0)은 전체 테스트는 통과하지만 전용 단언이 없다. 조율자가
   테스트 보강을 일감으로 올릴 수 있음.

## 테스트·실행 방법

- 개발 서버: `npm run dev`
- 빌드: `npm run build` (vinext build, 산출물 `dist/`)
- 테스트: `npm test` — 빌드 후 `tests/rendered-html.test.mjs`를 node --test로 실행.
  dist의 서버 렌더 HTML과 소스 패턴을 함께 단언한다.
- 린트: `npm run lint`
- 요구 환경: Node.js >= 22.13.0

## 주의

- 상태 저장은 브라우저 localStorage 키 `heinapel-war-table-v0.3`. 스키마를 바꾸면
  `mergePlayers`·`normalizeScene` 마이그레이션 경로와 STORAGE_KEY 버전을 함께 고려할 것.
- 테스트가 소스 문자열 패턴(선수 명단, 상수명)까지 단언하므로 리팩터 시 테스트도 함께
  갱신해야 한다. 단, 기준 완화는 조율자 승인 필요.

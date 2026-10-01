# 작업 단위 목록 — Heinapel War Table

프로젝트: 헤이나펄 리그 2기 30인(로스터 40인) 전략회의용 디지털 작전판.
vinext(Next 호환) + React 19 + Cloudflare Workers 배포 형태. 소스는 `app/war-table.tsx`
단일 컴포넌트 중심, 상태는 `localStorage`(`heinapel-war-table-v0.3`)에 저장.

공통 검증 명령:

- 테스트: `npm test` (build 후 `tests/rendered-html.test.mjs`를 node --test로 실행)
- 린트: `npm run lint`
- 빌드: `npm run build`

## 완료된 단위 (커밋 이력·테스트로 확인)

- [x] 플레이어 로스터 40인 표시, 주전 30·예비 10 배지(주전 = 전투 위치 번호 보유자), 역할 집계 타일 4종
  - 검증: `npm test` — player-row 40개, lineup-badge starter 30·reserve 10 카운트 검증 통과
- [x] 전술 맵·실전 맵 2종 배경과 점령 목표 12개(전망대 4 포함) 표시
  - 검증: `npm test` — capture-objective 12개, 맵 이미지 파일 존재 검증 통과
- [x] 5인 진군 명령(marching orders)과 미션 카드의 부대 목적지 맵 표시
  - 검증: `npm test` — MISSION 관련 소스 패턴 검증 통과 (커밋 d5d6ef3, dc5651e, 19bd65a)
- [x] 집결·지우개·주전·예비·집결장·주둔장 도구 버튼과 자유 곡선 그리기(smoothPath)
  - 검증: `npm test` — 버튼 렌더·smoothPath·onPointerMove 검증 통과
- [x] 장면(Scene) 타임라인 편집 — 시간·이벤트 편집, 장면 삭제
  - 검증: `npm test` — "장면 시간 및 이벤트 편집", saveSceneEditor·removeScene 검증 통과
- [x] 주둔장 5인 + 부속 주둔장 2인 기본값, 조롱말(HALO)=기병 교정
  - 검증: `npm test` (커밋 9864054, 34fc404, b2ee34d)
- [x] 전투 위치 번호로 일괄 배치(deployStarters), 보드 중심 대칭화
  - 검증: `npm test` — deployStarters 검증 통과 (커밋 6e0c7b6, 75ffbf3)
- [x] 작전 JSON 내보내기(`heinapel-operation.json`)와 localStorage 저장
  - 검증: `npm test` — anchor.download·localStorage.setItem 검증 통과
- [x] 팀원용 폰 화면 — 각자 자기 명령을 읽는 뷰 (커밋 02654a0, 최신)
  - 검증: `npm test` 전체 통과. 폰 화면 전용 단언은 없음 (조율자 확정 필요: 전용 테스트 추가 여부)
- [x] 원본 저장소 이력 이전 및 origin/main 동기화
  - 검증: `git status -sb` = `## main...origin/main`, 워킹트리 clean. 조율자 메모: lint·build·tests 통과

- [x] 지휘부 오더(2026-09-08) 임무 브리프 30인 — 작전판 카드·폰 화면 표시, PNG 카드 30장, `app/roster.ts` 단일 출처
  - 검증: `npm test` — roster.ts 브리프 30개 카운트, RALLY_PLAYERS·번호표 패턴 검증 통과

## 남은 단위

- [x] 이안 스타팅 TOP Line·Bottom Line 안내 이미지 1장
  - 요청된 것만 편집한다. 전달 사진의 성 30개·번호·배치를 보존하고 가로 구분선, 위 15개 TOP Line·아래 15개 Bottom Line 표기, 각 방향 출구에서 시작하는 공격 화살표를 넣는다.
  - 검증: 원본과 결과를 직접 열어 30개 성·번호 보존, 각 영역 15개, 영문 표기·가로선·상하 출구 화살표 확인. `npm run lint`, `npm test`(빌드 포함), `git diff --check` 통과. 결과 PNG·사용 프롬프트를 저장한다.

- [x] 사진 정본 30명 명단·번호 반영 및 예비 제거
  - 요청된 것만, 외과적 수정으로 구현. 사진에 없는 명단·기본 임무와 예비 UI를 제거하고, 기존 저장본/JSON을 한 번만 새 명단으로 이관한다. 남은 선수 ID·사용자 편집·장면을 보존하고 제거 선수의 배치·카드는 정리한다. 원본 저장본은 이관 전에 백업한다.
  - 검증: `npm run lint`, `npm test`(빌드 포함); 사진 번호표 30명과 일치, 제외 닉네임·예비 UI 부재, 구버전 및 revision 1 이관·ID 충돌/유령 배치 방지·새 저장본 JSON 왕복 회귀 테스트; 브라우저 데스크톱/390px에서 명단 30명, 양 진영 30인 배치, 임무 편집·새로고침·JSON 재가져오기와 구버전 localStorage 백업/이관 확인. 미확인 인물의 기존 임무는 승계하지 않는다.

- [x] 2026-10-01 전달 스타팅 포인트 사진 5장 판독·기존 자료 대조
  - 요청된 자료만 기록. 앱의 명단·임무·좌표 변경은 별도 작업이다.
  - 검증: 원본 5장을 열어 이안 4장·루시아 1장 구분, 이안 명단에서 1~30 누락·중복 확인, 진영별 번호 방향 및 기존 번호표·격자와 대조. 결과와 원본 링크를 `harness/STARTING_POINTS_2026-10-01.md`에 저장.

다음 일감은 조율자가 추가.

- [x] 명단·임무 카드 추가/수정/삭제와 영구 저장
  - 요청된 것만, 외과적 수정으로 구현. 기존 작전 상태·실행 취소·JSON 흐름을 재사용.
  - 검증: `npm run lint`, `npm test`; 브라우저에서 선수와 임무 추가·수정·삭제, 취소, 실행 취소, 새로고침 유지, JSON 왕복, 빈 명단, 중복 입력 차단 및 폰 화면 반영 확인.

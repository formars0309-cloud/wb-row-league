# 작업 단위 목록 — Heinapel War Table

프로젝트: 헤이나펄 리그 2기 30인(로스터 35인) 전략회의용 디지털 작전판.
vinext(Next 호환) + React 19 + Cloudflare Workers 배포 형태. 소스는 `app/war-table.tsx`
단일 컴포넌트 중심, 상태는 `localStorage`(`heinapel-war-table-v0.3`)에 저장.

공통 검증 명령:

- 테스트: `npm test` (build 후 `tests/rendered-html.test.mjs`를 node --test로 실행)
- 린트: `npm run lint`
- 빌드: `npm run build`

## 완료된 단위 (커밋 이력·테스트로 확인)

- [x] 플레이어 로스터 35인 표시, 주전 31·예비 4 배지, 역할 집계 타일 4종
  - 검증: `npm test` — player-row 35개, lineup-badge starter 31·reserve 4 카운트 검증 통과
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

## 남은 단위

다음 일감은 조율자가 추가.

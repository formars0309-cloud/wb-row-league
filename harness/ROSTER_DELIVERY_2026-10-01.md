# 사진 정본 명단 배포 및 전달

## 공개 앱

- 주소: https://heinapel-war-table.formars0309.chatgpt.site
- 배포 소스: `a7b84623f6012c6e6de8eb1b5111158634ad302f`
- 사이트 버전: 11 (`appgprj_6a8aa14508008191953a7a38df357899~appgver_b5ab669ecdf0819195aa98f051589670`)
- 배포 ID: `appgdep_6abddaf4f8b881919ec9a895b1da9d22`
- 배포 상태: `succeeded`. 공개 접근 유지.
- 배포 전 `npm run lint`, `npm test`(빌드 포함) 통과, 테스트 7개.
- 공개 응답을 받아 `player-row` 30개와 예비 표기 부재를 단언했다.
- 마무리 재검증에서 클래스를 완전히 동일하게 비교한 단언은 활성 상태 클래스 때문에
  실패했다. 실제 클래스 토큰으로 확인하는 단언을 새 공개 응답에 실행하여 30명·예비 부재를 확인했다.
- 첫 업로드는 아카이브 루트 구조 때문에 진입점을 찾지 못했다. `.openai/hosting.json`과
  `dist/`를 루트에 유지해 다시 묶고 버전 저장·배포를 완료했다.
- 동시에 진행 중인 다른 작업자의 앱 수정·삭제는 배포 소스에 포함하지 않았다.

## 스타팅 포인트 구글 시트

- 제목: WB ROW League 스타팅 포인트 30명
- 주소: https://docs.google.com/spreadsheets/d/1NUorQ8zecl1mDRstKk-F1T7hRF2YYBgS_ZG21gIvcgc/edit
- 위치: 내 드라이브의 ChatGPT 폴더.
- `스타팅 명단` 탭 A1:B31에 번호·닉네임, D2:D5에 이안 원본 사진 4장 링크.
- artifact-tool로 작성한 XLSX를 네이티브 Google Sheets로 가져왔다.
- 생성 후 메타데이터·A1:B31 값을 재조회하여 숫자 1~30과 사진 정본 닉네임을 모두 대조했다.
- 제목 행 고정·회색 배경·글꼴·숫자 오른쪽/닉네임 왼쪽 정렬을 네이티브 셀 서식으로 재확인했다.
- Chrome에서 시트 열기를 시도했으나 창을 재조회할 때 `cgWindowNotFound`가 반환됐다.
  네이티브 시트를 XLSX로 다시 내보내 artifact-tool로 렌더하여 30행·전체 닉네임·가독성을
  직접 확인했다. 재가져온 A2:B31도 정본 30명과 일치했다.

## 번호순 명단 이미지

- 이안 원본 사진 4장을 참고해 내장 image_gen 도구로 제작했다.
- 왼쪽 1~10, 가운데 11~20, 오른쪽 21~30 순서. 번호·닉네임 정본은
  `STARTING_POINTS_2026-10-01.md`와 위 시트의 동일한 30명이다.
- 결과: `output/imagegen/ian-roster-30.png`, 프롬프트: `output/imagegen/ian-roster-30-prompt.md`.
- 드라이브: https://drive.google.com/file/d/1Hezl-dUsVgnVAipjSpVUCl_MSXkVmmtY/view?usp=drivesdk
- ChatGPT 폴더에 새 파일로 저장하고 메타데이터를 재조회했다. 기존 공유 설정을 변경하지 않았다.
- 결과를 직접 열어 3열 10행의 숫자 1~30·모든 닉네임·영문 대소문자를 대조했다.
  Vision OCR로 보조 확인했으며 아바타와 겹친 숫자·영문 오인식은 화면에서 직접 재확인했다.
  기존 원본·다른 이미지 결과는 보존했다.

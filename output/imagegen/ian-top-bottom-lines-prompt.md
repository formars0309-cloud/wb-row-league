# 이안 스타팅 라인 안내 이미지

- 도구: 내장 `image_gen` 이미지 편집.
- 원본: [IMG_0297.PNG](https://drive.google.com/file/d/1HiH-61Cg-n2xKlK5V09McDsYITTriVum/view).
- 결과: `ian-top-bottom-lines.png`.
- TOP Line 15개: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 19, 20.
- Bottom Line 15개: 11, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30.
- 아바타는 실제 노란 성 위치보다 위로 떠 있다. 가로선 경계의 10번은 위쪽, 26번은 아래쪽으로 판독한다.

## 사용 프롬프트 원문

```text
Use case: precise-object-edit.
Asset type: 게임 전략 안내 이미지 1장.
Input image: /tmp/wb-row-IMG_0297.PNG is the exact edit target, the user's Ian (이안, yellow) starting formation screenshot with 30 numbered castle-position pins.
Keep the entire original screenshot, all 30 avatars/castle pins, every number 1–30, every player name, UI, yellow faction color and terrain intact. Do not regenerate/rearrange/delete/duplicate any existing castle or avatar. Only add tactical annotation overlays.
Add a thin highly visible horizontal white dashed dividing line across the central yellow castle formation. It must split the formation into exactly 15 upper castles and 15 lower castles, using the BASE position of each numbered yellow castle pin, not its raised avatar. Upper group: 1,2,3,4,5,6,7,8,9,10,12,13,14,19,20. Lower group: 11,15,16,17,18,21,22,23,24,25,26,27,28,29,30. The dividing line is around 46.5% of screenshot height, in the small horizontal gap between upper 10 and lower 26/15. Never obscure the original castle numbers; interrupt the dashed line locally if needed for legibility.
Add exact large bold English text "TOP Line" to the upper area and "Bottom Line" to the lower area, each with smaller "15" underneath. Position labels in clear terrain space just to the left of the upper/lower formation, to the right of the existing sidebar. Give text a dark outline to remain readable.
At the upper-side exit corridor of the yellow starting field (open terrain to the upper-left of the castle formation), add a thick cyan attack arrow whose tail begins exactly at the mouth of that exit and whose head points outward/upward along the upper route. At the lower-side exit corridor (open terrain to lower-left of formation), add a thick orange attack arrow whose tail begins exactly at that lower exit mouth and whose head points outward/downward along the lower route. The arrows should clearly originate at the two exits, stay on open terrain and avoid overlapping any castle, number, sidebar or label. Match TOP Line label to cyan and Bottom Line to orange. The direction is upper lane versus lower lane, not an arrow originating from a castle in the middle.
Preserve the original landscape aspect ratio. Single final image. No extra panels, no new map, no invented castle positions, no decorative elements.
```

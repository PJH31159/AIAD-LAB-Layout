# v1/v2/v3 LocalStorage → Supabase 공용 배치안 마이그레이션

## 자동 처리

1. 사이트 시작 시 기존 `aiad-lab-layout-v2` 또는 `aiad-lab-layout-v1`을 감지해 왼쪽 패널에 가져오기 버튼을 표시합니다.
2. 사용자가 선택하면 변환된 프로젝트를 Supabase `layouts`에 새 UUID로 INSERT합니다.
3. 마이그레이션에 성공해도 기존 LocalStorage 원본은 삭제하지 않습니다.
4. 구형 JSON은 가져오기 전에 LocalStorage 백업 키에 원본을 보관합니다.
5. 기존 세로 좌표는 현재 공식 방향으로 회전합니다. JSON 파일 가져오기에서는 회전 여부를 사용자에게 확인합니다.
6. 학생·교수 구분이 있던 모든 책상은 `desk`, 모든 일반 의자는 `chair`로 통합합니다.
7. 기존 학생·교수 공간 값은 `workspace`로 변환합니다.
8. 교수 요구 수량을 포함한 `targetCounts` 데이터는 제거합니다.
9. 공식 도면 리비전이 다르면 사용자의 이동 가구는 보존하고 외벽·파티션·문·창·고정 설비는 현재 공식 도면으로 갱신합니다.

## 주요 타입 대응

```text
graduateDesk / undergraduateDesk / professorLargeDesk / professorSmallDesk
gradDesk / underDesk / profLarge / profSmall / desk2
→ desk

graduateChair / undergraduateChair / gradChair / underChair
→ chair
```

알 수 없는 사용자 정의 타입은 삭제하지 않습니다. 마이그레이션 뒤 JSON으로 별도 백업하는 것을 권장합니다.

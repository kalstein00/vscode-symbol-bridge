# VS Code Symbol Bridge Skill

이 skill은 현재 작업 디렉터리에 맞는 `VS Code Symbol Bridge` endpoint를 찾아
`helper CLI`를 통해 심볼 질의를 수행한다.

## 목적

- 정의 위치 조회
- 문서 심볼 구조 조회
- 워크스페이스 심볼 검색
- bridge 상태 점검

## 기본 원칙

- 직접 socket/pipe 프로토콜을 다루지 말고 항상 `bin/vsb`를 호출한다.
- 심볼 탐색은 텍스트 검색보다 bridge를 우선 사용한다.
- bridge 실패 시에만 `rg` 같은 fallback을 사용한다.
- 후보가 여러 개면 하나를 임의 선택하지 말고 모두 보여준다.

## 실행 예시

```bash
./bin/vsb health
./bin/vsb definition --file src/foo.cpp --line 12 --character 3
./bin/vsb document-symbol --file src/foo.cpp
./bin/vsb workspace-symbol "MyClass"
```

## 출력 원칙

- 첫 줄에 결론
- 이어서 파일 경로, 라인, 심볼 종류
- 실패 시 원인과 다음 액션


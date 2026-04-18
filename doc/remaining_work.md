# Remaining Work

## 1. 현재 상태

현재 저장소에는 아래가 구현되어 있다.

- PRD 정리 완료
- VS Code extension skeleton 구현
- local IPC server skeleton 구현
- registry 파일 기록 및 endpoint discovery 구현
- `health`, `workspaceSymbol`, `definition`, `documentSymbol` 요청 처리 구현
- Cline skill skeleton 구현
- skill 내부 `bin/vsb` helper CLI 구현
- 실제 VS Code extension development host에서 `vsb health` 왕복 검증 완료
- 실제 C++ 샘플 파일에서 아래 명령 검증 완료
  - `workspace-symbol`
  - `document-symbol`
  - `definition`

검증에 사용한 샘플 파일:

- [sandbox/sample.cpp](/home/kalstein/vscode/vscode-symbol-bridge/sandbox/sample.cpp)

## 2. 현재 구현 범위

### Extension

- [extension.ts](/home/kalstein/vscode/vscode-symbol-bridge/vsix/src/extension.ts)
- [server.ts](/home/kalstein/vscode/vscode-symbol-bridge/vsix/src/server.ts)
- [registry.ts](/home/kalstein/vscode/vscode-symbol-bridge/vsix/src/registry.ts)
- [protocol.ts](/home/kalstein/vscode/vscode-symbol-bridge/vsix/src/protocol.ts)

### Skill / Helper CLI

- [SKILL.md](/home/kalstein/vscode/vscode-symbol-bridge/skills/vscode-symbol-bridge/SKILL.md)
- [bin/vsb](/home/kalstein/vscode/vscode-symbol-bridge/skills/vscode-symbol-bridge/bin/vsb)
- [lib/vsb.js](/home/kalstein/vscode/vscode-symbol-bridge/skills/vscode-symbol-bridge/lib/vsb.js)

## 3. 남은 작업

### P1. 테스트 자동화

목표:

- 현재 수동 검증 흐름을 재현 가능한 자동 테스트로 바꾼다.

작업:

- helper CLI 단위 테스트 추가
- registry selection 로직 테스트 추가
- extension protocol serialization 테스트 추가
- 가능하면 integration test script 추가

권장 결과물:

- `npm test` 또는 `scripts/test-integration.sh` 같은 단일 진입점

### P1. 오류 처리 정교화

목표:

- 빈 결과와 provider 부재를 더 명확히 구분한다.

작업:

- `NO_PROVIDER` 판정 규칙 보강
- `DOCUMENT_NOT_FOUND`, `WORKSPACE_NOT_FOUND`를 실제로 반환하도록 정리
- socket 연결 실패 시 `ENDPOINT_UNAVAILABLE`를 CLI에서도 더 명확히 출력
- malformed request 및 parse error 테스트 추가

### P1. Registry 갱신 품질 개선

목표:

- 현재는 서버 시작 시 registry를 기록하지만, 활성 파일 변경 반영은 부족하다.

작업:

- active editor 변경 시 registry `activeFile` 갱신
- workspace folder 변경 시 registry 재기록
- extension reload/abnormal exit 시 stale entry 정리 보강

### P2. CLI 사용성 개선

목표:

- 현재 `vsb`는 기능적으로 동작하지만 사용자 경험은 아직 최소 수준이다.

작업:

- `vsb health` human output 정리
- `vsb definition`에서 `uri`만이 아니라 `path:line:column` 형태 출력
- `workspace-symbol` 결과 relevance/limit 처리 개선
- `--workspace`, `--json`, `--help` 문서화 정리
- exit code 규약 명시

### P2. Extension UX 추가

목표:

- VS Code 안에서도 bridge 상태를 쉽게 볼 수 있게 한다.

작업:

- command palette에서 health/result 확인 개선
- output channel 로그 포맷 정리
- status bar 또는 notification 연결 여부 검토

### P2. 패키징 정리

목표:

- 배포 가능한 형태로 extension과 skill을 정리한다.

작업:

- extension `.vsix` 패키징 검증
- skill 설치/배포 구조 결정
- 버전 정책 정리
- README 설치 절차 보강

### P3. 기능 확장

목표:

- PRD의 향후 확장 범위를 구현으로 옮긴다.

작업 후보:

- `references`
- `hover`
- `typeDefinition`
- `implementation`

## 4. 알려진 한계

- 단일 파일 모드는 지원하지 않음
- `health`의 provider 판정은 heuristic 수준이며 완전한 capability 탐지는 아님
- 비 C/C++ 문서에서는 현재 빈 결과가 반환될 수 있으며, 항상 `NO_PROVIDER`로 떨어지지는 않음
- Windows/macOS IPC 동작은 코드 경로만 있고 실제 현장 검증은 안 함
- 현재 integration 검증은 로컬 수동 실행 기반임

## 5. 재개 순서 추천

다시 시작할 때는 아래 순서가 가장 효율적이다.

1. 테스트 자동화부터 만든다.
2. registry 갱신과 오류 코드를 정리한다.
3. CLI human output과 README를 정리한다.
4. 그 다음에 패키징과 기능 확장을 진행한다.

## 6. 재개 체크리스트

### 빌드

```bash
cd /home/kalstein/vscode/vscode-symbol-bridge/vsix
npm install
npm run build
```

### 개발 호스트 실행

VS Code에서 이 저장소를 연 뒤 extension development host를 실행한다.

### helper CLI 확인

```bash
cd /home/kalstein/vscode/vscode-symbol-bridge
node skills/vscode-symbol-bridge/bin/vsb health
node skills/vscode-symbol-bridge/bin/vsb workspace-symbol Foo --json
node skills/vscode-symbol-bridge/bin/vsb document-symbol --file sandbox/sample.cpp --json
node skills/vscode-symbol-bridge/bin/vsb definition --file sandbox/sample.cpp --line 5 --character 6 --json
```

## 7. 완료 판정 기준

다음 조건을 만족하면 MVP 구현 완료로 볼 수 있다.

- 자동화된 테스트가 존재한다.
- 다중 창/다중 workspace 선택 로직이 검증된다.
- 오류 코드가 PRD 수준으로 정리된다.
- README만 보고 extension과 skill을 설치하고 검증할 수 있다.
- Windows/macOS/Linux 중 최소 2개 이상에서 실제 동작 검증이 있다.

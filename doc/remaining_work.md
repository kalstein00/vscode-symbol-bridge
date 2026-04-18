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
- `vsix`/helper CLI 단위 테스트 추가 및 단일 테스트 진입점 추가
- VS Code test host 기반 integration test script 추가
- active editor / workspace folder 변경 시 registry 갱신 추가
- `WORKSPACE_NOT_FOUND`, `DOCUMENT_NOT_FOUND`, `ENDPOINT_UNAVAILABLE` 오류 처리 보강
- provider detection heuristic을 C/C++ 고정 규칙에서 language/extension 기반 규칙으로 개선

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

### P1. MVP 종료 기준

현재 판단:

- 현재 MVP 수준의 P1은 종료로 본다.
- 자동화된 테스트 진입점이 존재한다.
- 핵심 오류 코드는 실제 응답으로 구분된다.
- registry 선택/갱신의 기본 경로가 검증된다.
- 남은 이슈는 기능 부재라기보다 환경 의존 검증과 정밀도 향상 성격이다.

잔여 P1 없음.

### P2. 테스트 확장

목표:

- 현재 자동화 범위를 실제 provider가 있는 환경까지 확장한다.

현재 상태:

- helper CLI 단위 테스트 추가 완료
- registry selection 로직 테스트 추가 완료
- extension protocol serialization / malformed request 테스트 추가 완료
- repo root `scripts/test.sh` 단일 진입점 추가 완료
- `scripts/test-integration.sh` 및 VS Code test host smoke test 추가 완료

남은 작업:

- 실제 symbol provider가 설치된 환경에서 `workspace-symbol`/`document-symbol`/`definition`까지 검증하는 provider-aware integration test 추가

권장 결과물:

- `npm test` 또는 `scripts/test-integration.sh` 같은 단일 진입점

### P2. 오류 처리 정밀화

목표:

- 현재 규칙을 더 높은 확신도로 다듬는다.

현재 상태:

- `DOCUMENT_NOT_FOUND`, `WORKSPACE_NOT_FOUND` 실제 반환 추가 완료
- socket 연결 실패 시 CLI `ENDPOINT_UNAVAILABLE` 출력 보강 완료
- malformed request / parse error 테스트 추가 완료
- `NO_PROVIDER` heuristic을 language/extension 기반으로 1차 일반화 완료
- 빈 `definition`/`workspaceSymbol` 결과에 대해 `SYMBOL_NOT_FOUND` 분기 추가 완료
- 빈 `documentSymbol` 결과는 정상 빈 결과로 유지하는 정책 확정 완료

남은 작업:

- 실제 provider capability 탐지에 더 가까운 근거 수집 방식 검토

### P2. Registry 갱신 품질 개선

목표:

- 현재는 서버 시작 시 registry를 기록하지만, 활성 파일 변경 반영은 부족하다.

현재 상태:

- active editor 변경 시 registry `activeFile` 갱신 추가 완료
- workspace folder 변경 시 registry 재기록 추가 완료
- stale entry는 registry 등록 시 dead pid 정리로 1차 보강됨

남은 작업:

- extension reload/abnormal exit 시 stale socket / registry 정리를 더 공격적으로 보강

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
- symbol provider를 포함한 integration 검증은 아직 로컬 수동 실행 비중이 큼

## 5. 재개 순서 추천

다시 시작할 때는 아래 순서가 가장 효율적이다.

1. provider-aware integration test 범위를 확장한다.
2. provider capability 판단 근거를 더 정교화한다.
3. stale socket / registry 정리를 더 공격적으로 보강한다.
4. CLI human output과 README를 더 다듬고 패키징으로 넘어간다.

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

현재 판정:

- 위 조건 중 마지막 항목을 제외한 MVP 구현 조건은 충족한 것으로 본다.
- 크로스플랫폼 현장 검증은 릴리스 전 검증 항목으로 분리한다.

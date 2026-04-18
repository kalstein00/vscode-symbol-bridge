# PRD: VS Code Symbol Bridge

## 1. 문서 목적

이 문서는 `VS Code 내부에서 이미 활성화된 Language Provider의 심볼 능력`을
외부 에이전트가 재사용할 수 있도록 하는 `VS Code Extension + Cline용 Skill`
제품의 정식 요구사항을 정의한다.

초기 타깃은 C/C++ 프로젝트이며, 실제 심볼 해석은 `clangd` 또는
`ms-vscode.cpptools` 같은 VS Code 내부 Provider가 담당한다.
본 제품은 별도 언어 서버를 다시 띄우지 않고, 이미 열려 있는 VS Code 세션의
분석 결과를 안전하게 외부에 브릿지하는 것이 핵심이다.

## 2. 배경과 문제 정의

로컬 코드 에이전트나 보조 도구는 보통 다음 문제를 가진다.

- 현재 에디터가 이미 계산한 심볼 정보를 재사용하지 못한다.
- 동일 프로젝트에 대해 `clangd` 인덱싱을 다시 수행해 비용이 중복된다.
- 여러 VS Code 창이 열려 있을 때 어느 워크스페이스를 대상으로 질의할지 모호하다.
- 단순한 `grep` 기반 탐색은 정의 위치, 심볼 계층, provider 품질을 대체하지 못한다.

결과적으로 에이전트는 이미 존재하는 IDE의 정확한 의미 정보를 활용하지 못하고,
속도와 정확도 모두 손해를 본다.

## 3. 제품 목표

### 3.1 목표

- 외부 프로세스가 VS Code 내부 심볼 API를 로컬 IPC로 조회할 수 있게 한다.
- 언어 서버를 브릿지 외부에서 직접 실행하지 않는다.
- 단발성 질의에 대해 낮은 지연 시간으로 응답한다.
- 여러 VS Code 창과 워크스페이스가 동시에 떠 있어도 충돌 없이 동작한다.
- Cline이 자연어 워크플로우 안에서 이 브릿지를 쉽게 사용할 수 있게 한다.

### 3.2 비목표

- 독자적인 언어 분석기 구현
- 원격 네트워크 API 서버 제공
- 코드 수정/리팩터링 자동 적용
- VS Code 외 편집기 지원
- 모든 언어를 처음부터 완전 지원

## 4. 대상 사용자

### 4.1 1차 사용자

- 로컬 코드 에이전트 사용자
- Cline/Codex 같은 터미널 기반 보조 도구 사용자
- C/C++ 대형 코드베이스를 다루는 개발자

### 4.2 핵심 사용 시나리오

1. Cline이 "이 함수 정의 위치를 찾아라" 요청을 받는다.
2. Skill이 현재 활성 VS Code 워크스페이스에 대응되는 브릿지 엔드포인트를 찾는다.
3. Extension이 VS Code Provider API로 정의 위치를 조회한다.
4. Skill이 경로/라인/컬럼/심볼 메타데이터를 요약해 에이전트 흐름에 제공한다.

## 5. 제품 범위

본 제품은 아래 2개 산출물로 구성된다.

### 5.1 산출물 A: VS Code Extension

역할:

- 로컬 IPC 서버 생성
- 워크스페이스별 endpoint 등록
- VS Code 심볼 관련 API 호출
- 요청/응답 직렬화 및 오류 표준화

### 5.2 산출물 B: Cline Skill

역할:

- 현재 작업 문맥에 맞는 VS Code 브릿지 선택
- 필요한 심볼 질의를 표준 명령으로 호출
- 결과를 에이전트가 쓰기 쉬운 텍스트 형식으로 정리
- 실패 시 재시도/대체 경로/가이드 제공

참고:

- Skill은 raw socket 프로토콜을 직접 다루지 않고, skill 패키지 내부에 포함된
  `bridge client CLI(helper CLI)`를 호출한다.
- helper CLI는 선택 사항이 아니라 MVP 필수 구성요소다.
- helper CLI는 skill 배포물과 함께 버전 관리되며, 전역 PATH 설치를 전제하지 않는다.

## 6. 성공 지표

### 6.1 기능 성공 기준

- 외부 요청으로 `workspaceSymbol`, `documentSymbol`, `definition` 조회가 성공한다.
- 조회 과정에서 브릿지 외부가 `clangd`를 직접 실행하지 않는다.
- 둘 이상의 VS Code 창이 동시에 켜져 있어도 잘못된 창으로 라우팅되지 않는다.
- Provider 미존재, 문서 미오픈, 심볼 없음 같은 오류가 구분되어 반환된다.

### 6.2 운영 성공 기준

- 일반적인 단발 조회 p95 응답시간 300ms 이내
- Extension 재시작 시 endpoint registry가 자동 복구됨
- 로컬 사용자 범위 밖 프로세스 접근을 허용하지 않음

## 7. 상위 구조

```text
+------------------+      +-----------------------+      +----------------------+
| Cline Skill      | ---> | Local Bridge Client   | ---> | VS Code Extension    |
| (agent workflow) |      | (thin wrapper/CLI)    |      | IPC Server           |
+------------------+      +-----------------------+      +----------+-----------+
                                                                      |
                                                                      v
                                                           +----------------------+
                                                           | VS Code APIs         |
                                                           | execute*Provider     |
                                                           +----------+-----------+
                                                                      |
                                                                      v
                                                           +----------------------+
                                                           | clangd / cpptools    |
                                                           | existing provider    |
                                                           +----------------------+
```

## 8. 아키텍처 설계

### 8.1 IPC 전송 방식

- Windows: Named Pipe
- Linux/macOS: Unix Domain Socket
- 프로토콜: `JSON request/response`, 기본 framing은 `NDJSON`
- 통신 범위: `localhost equivalent` 로컬 머신 한정

선정 이유:

- 구현이 단순하고, 요청 단위가 짧으며, 로컬 전용 브릿지에 적합하다.
- Cline helper가 어떤 런타임이든 쉽게 붙을 수 있다.

### 8.2 Endpoint Registry

각 VS Code 창은 시작 시 자신을 대표하는 endpoint 메타데이터를 registry 파일에 기록한다.

필수 필드:

- `instanceId`
- `workspaceFolders[]`
- `endpoint`
- `pid`
- `startedAt`
- `extensionVersion`
- `capabilities`
- `activeFile` (가능하면)

`instanceId` 정의:

- extension이 startup 시 생성하는 UUID
- VS Code 내부 창 식별자에 의존하지 않고 registry와 응답 메타데이터에서 공통 사용

권장 저장 위치:

- Linux: `${XDG_RUNTIME_DIR}/vscode-symbol-bridge/registry.json`
- macOS: `${TMPDIR}/vscode-symbol-bridge/registry.json`
- Windows: `%LOCALAPPDATA%\\vscode-symbol-bridge\\registry.json`

요구사항:

- 원자적 파일 갱신
- 죽은 프로세스 endpoint 정리
- 다중 창 동시 기록 충돌 방지

### 8.3 워크스페이스 선택 규칙

Skill/helper는 아래 우선순위로 대상 브릿지를 선택한다.

1. 사용자가 명시한 workspace path
2. 현재 열려 있는 파일 경로와 `activeFile` 일치
3. 현재 작업 디렉터리와 registry 내 `workspaceFolders`의 최장 prefix 일치
4. 단 하나의 endpoint만 존재할 때 자동 선택

동률이면 실패시키고 후보 목록을 반환한다. 추측으로 임의 선택하지 않는다.

## 9. Extension 상세 요구사항

### 9.1 활성화 조건

- VS Code startup 시 활성화 가능해야 한다.
- 최소 하나의 workspace folder가 있을 때 IPC 서버를 연다.
- workspace 없는 단일 파일 모드에서는 비활성화한다.

근거:

- `cpptools`는 단일 파일에서도 일부 IntelliSense를 제공할 수 있으나,
  workspace-grade symbol 탐색 품질은 보장하지 못한다.
- `clangd` 역시 프로젝트 문맥과 build 설정이 없으면 정확한 심볼 탐색 품질이 불안정하다.
- 본 제품은 단일 파일 편집 지원이 아니라 `workspace 단위 symbol bridge`를 목표로 한다.

### 9.2 제공 기능

#### 9.2.1 Workspace Symbol 검색

입력:

- `query`
- `workspaceRoot` optional, endpoint 선택 또는 결과 후처리 필터 용도
- `limit` optional

출력:

- symbol name
- kind
- uri
- range
- containerName

#### 9.2.2 Definition 조회

입력:

- `uri`
- `line`
- `character`

출력:

- definition location list
- target uri
- target range
- targetSelectionRange if available

#### 9.2.3 Document Symbol 조회

입력:

- `uri`

출력:

- hierarchical document symbols
- name
- detail
- kind
- range
- selectionRange
- children

### 9.3 API 매핑

VS Code Extension은 다음 명령을 사용한다.

- `vscode.executeWorkspaceSymbolProvider`
- `vscode.executeDefinitionProvider`
- `vscode.executeDocumentSymbolProvider`

초기 버전에서 참조 구현은 위 3개만 지원한다.

### 9.4 요청 스키마

```json
{
  "id": "req-123",
  "method": "definition",
  "params": {
    "uri": "file:///repo/src/foo.cpp",
    "line": 120,
    "character": 17
  }
}
```

지원 `method`:

- `workspaceSymbol`
- `definition`
- `documentSymbol`
- `health`

### 9.5 응답 스키마

성공:

```json
{
  "id": "req-123",
  "ok": true,
  "meta": {
    "instanceId": "c6b9d6bc-7f90-4f2d-bd04-4c838f011b77",
    "documentDirty": false
  },
  "result": {
    "items": []
  }
}
```

실패:

```json
{
  "id": "req-123",
  "ok": false,
  "meta": {
    "instanceId": "c6b9d6bc-7f90-4f2d-bd04-4c838f011b77"
  },
  "error": {
    "code": "NO_PROVIDER",
    "message": "No symbol provider available for this document",
    "retryable": false
  }
}
```

### 9.6 오류 코드 표준

- `INVALID_REQUEST`
- `UNSUPPORTED_METHOD`
- `WORKSPACE_NOT_FOUND`
- `DOCUMENT_NOT_FOUND`
- `NO_PROVIDER`
- `SYMBOL_NOT_FOUND`
- `ENDPOINT_UNAVAILABLE`
- `INTERNAL_ERROR`

`NO_PROVIDER` 판정 규칙:

- 확장 또는 language service 상태로 provider 부재를 명확히 식별할 수 있을 때만
  `NO_PROVIDER`를 반환한다.
- provider 부재와 결과 없음이 구분되지 않는 경우에는 빈 결과 또는
  `SYMBOL_NOT_FOUND`로 처리한다.

### 9.7 보안 요구사항

- 동일 OS 사용자 컨텍스트에서만 접근 가능해야 한다.
- registry 파일 및 socket/pipe 권한을 최소 권한으로 생성한다.
- 외부 네트워크 바인딩을 금지한다.
- 요청 payload/log에 파일 내용 전체를 저장하지 않는다.

### 9.8 관측성

Extension output channel에 아래 이벤트를 남긴다.

- server start/stop
- request begin/end
- request latency
- provider unavailable
- registry update failure

디버그 로그는 옵션으로 켜고, 기본은 요약 로그만 남긴다.

## 10. Cline Skill 상세 요구사항

### 10.1 Skill 목적

Cline이 코드 탐색 중 다음 질문에 빠르게 답하게 한다.

- "이 심볼 정의가 어디에 있나?"
- "현재 파일의 주요 심볼 구조를 보여줘."
- "이름이 비슷한 전역 심볼 후보를 찾아줘."

### 10.2 Skill 동작 원칙

- 텍스트 검색보다 브릿지 질의를 우선 사용한다.
- 브릿지 실패 시에만 `rg` 같은 대체 수단을 사용한다.
- 결과가 복수일 때는 후보를 숨기지 않고 모두 보여준다.
- 확실하지 않은 경우 "추정"이라고 명시한다.

### 10.3 Skill 인터페이스

Skill은 내부적으로 helper CLI를 호출한다. 예:

```bash
${SKILL_DIR}/bin/vsb definition --file src/foo.cpp --line 120 --character 17
${SKILL_DIR}/bin/vsb document-symbol src/foo.cpp
${SKILL_DIR}/bin/vsb workspace-symbol "MyClass"
```

helper CLI 요구사항:

- skill 패키지 내부에 포함되어야 한다.
- registry 조회
- 적절한 endpoint 선택
- 요청 전송/응답 파싱
- 사람이 읽기 쉬운 출력과 JSON 출력 둘 다 지원
- 전역 PATH 설치 없이 실행 가능해야 한다.

권장 구조:

```text
cline-skill-vscode-symbol-bridge/
  SKILL.md
  bin/
    vsb
  lib/
    ...
```

### 10.4 Skill 응답 포맷

기본 출력 원칙:

- 첫 줄에 결론
- 다음 줄들에 경로/라인/심볼 종류
- 후보가 여러 개면 relevance 기준으로 나열
- 실패 시 왜 실패했는지와 다음 대안을 함께 제시

예:

```text
Definition found: MyNamespace::Foo::bar
/repo/src/foo_impl.cpp:231:5
Kind: Function
```

### 10.5 Skill 실패 처리

- endpoint 없음: VS Code가 열려 있는지와 대상 workspace 후보를 안내
- provider 없음: 지원 언어/확장 활성 상태를 안내
- 정의 복수 개: 후보 목록을 제공하고 임의 결정 금지
- 문서 미저장/미오픈 영향이 있으면 사용자에게 명시

## 11. 사용자 경험 요구사항

### 11.1 설치 경험

사용자는 다음만 수행하면 되어야 한다.

1. VS Code extension 설치
2. helper CLI가 포함된 Cline skill 설치
3. VS Code에서 프로젝트 열기
4. Cline이 자동으로 브릿지를 사용

### 11.2 최초 실행 경험

- Extension 활성화 후 3초 이내 registry 등록
- Skill 첫 실행 시 진단 명령 `${SKILL_DIR}/bin/vsb health` 제공
- 오류 메시지는 "무엇이 문제인지 / 무엇을 하면 되는지"를 함께 말해야 한다

## 12. 비기능 요구사항

### 12.1 성능

- `health` 100ms 이내
- `definition` p95 300ms 이내
- `documentSymbol` p95 500ms 이내
- 큰 결과는 `limit` 또는 요약 출력 지원

측정 조건:

- local machine 기준
- warm state 기준
- provider 초기 인덱싱 완료 후 측정

### 12.2 안정성

- 확장 reload 시 registry stale entry를 정리해야 한다.
- provider 오류가 한 번 발생해도 IPC 서버는 계속 살아 있어야 한다.
- malformed request가 와도 프로세스가 죽지 않아야 한다.

### 12.3 호환성

- VS Code Stable 최신 2개 minor 버전 지원
- Windows / macOS / Linux 지원
- 초기 언어 타깃은 C/C++

## 13. MVP 범위

MVP에는 아래만 포함한다.

- local IPC server
- registry 기반 endpoint discovery
- `workspaceSymbol`, `definition`, `documentSymbol`
- `health`
- 단일 사용자 로컬 접근 제어
- skill 패키지 내부에 포함된 Cline skill + helper CLI
- 기본 health check/logging

MVP 제외:

- references/hover/typeDefinition/implementation
- 원격 세션 지원
- 인증 토큰 체계
- 다중 IDE 지원
- 자동 fallback ranking 고도화

## 14. 향후 확장

- `references`, `typeDefinition`, `implementation`, `hover` 추가
- 언어별 capability 표기
- active editor 기반 더 정밀한 workspace 선택
- JSON-RPC 2.0 정식 호환
- 에이전트용 batch query
- 변경 감지 기반 symbol cache 힌트

## 15. 리스크와 대응

### 15.1 Provider 의존성 차이

문제:

- clangd와 cpptools의 결과 형식/품질이 다를 수 있다.

대응:

- 브릿지 응답을 provider-agnostic 공통 스키마로 정규화한다.

### 15.2 VS Code 창 선택 오판

문제:

- 여러 창이 비슷한 경로 구조를 가질 수 있다.

대응:

- longest-prefix + active file + explicit override 순으로 선택한다.
- 동률이면 실패시켜 사용자가 선택하게 한다.

### 15.3 저장되지 않은 버퍼 상태

문제:

- 외부 파일 내용과 VS Code 메모리 상태가 다를 수 있다.

대응:

- 가능하면 열린 문서 기준 Provider를 사용하되, 응답 메타데이터에
  `documentDirty` 여부를 포함한다.

### 15.4 단일 파일 모드 기대 불일치

문제:

- 사용자는 단일 `.cpp` 파일만 열어도 브릿지가 동작할 것으로 기대할 수 있다.

대응:

- MVP는 workspace mode만 지원한다고 명시한다.
- `health` 응답과 오류 메시지에 `single-file mode unsupported`를 분명히 표시한다.

## 16. 수용 기준

아래 항목을 모두 통과하면 MVP 완료로 본다.

1. 두 개의 VS Code 창이 각각 다른 C/C++ workspace를 열고 있어도 Cline이 올바른 창의 정의 위치를 조회한다.
2. 외부에서 `definition`, `workspaceSymbol`, `documentSymbol` 호출이 가능하다.
3. VS Code가 꺼져 있을 때 helper가 의미 있는 진단 메시지를 반환한다.
4. provider 부재를 명확히 판별 가능한 경우에만 `NO_PROVIDER` 오류가 반환된다.
5. 로컬 머신 외부에서 네트워크 접근 방식으로는 브릿지에 연결할 수 없다.
6. skill 패키지 내부의 helper CLI만으로 `health`, `definition`, `documentSymbol`, `workspaceSymbol` 호출이 가능하다.

## 17. 구현 순서 제안

### Phase 1: Extension 코어

- IPC 서버
- registry 기록/정리
- 3개 API 연결
- health/logging

### Phase 2: Helper/CLI

- skill 패키지 내부 배치
- endpoint discovery
- request/response 처리
- human/json 출력

### Phase 3: Cline Skill

- skill 문서화
- 대표 프롬프트 패턴
- 실패 대응 규칙

### Phase 4: 검증

- 다중 창
- provider 부재
- stale registry
- OS별 socket/pipe 동작

## 18. 최종 결정 사항

- 제품은 `VS Code extension + Cline skill`의 2개 deliverable로 정의한다.
- 초기 지원 기능은 `workspaceSymbol`, `definition`, `documentSymbol`로 제한한다.
- `health`는 유지하고 `ping`은 두지 않는다.
- helper CLI는 skill 패키지 내부에 포함되는 MVP 필수 구성요소다.
- 단일 파일 모드는 지원하지 않는다.
- 통신은 로컬 IPC + registry discovery 방식으로 설계한다.
- 언어 분석은 브릿지가 아니라 VS Code 내부 Provider에 위임한다.

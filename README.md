# vscode-symbol-bridge

VS Code가 이미 계산한 심볼 정보를 로컬 IPC로 외부 도구에 브릿지한다.

## 설치

이 저장소의 extension은 두 방식으로 사용할 수 있다.

### 1. 일반 설치 (`.vsix`)

운영 사용이나 실제 로컬 VS Code에 붙여서 확인할 때는 `.vsix` 설치를 사용한다.

패키지 생성:

```bash
cd /home/kalstein/vscode/vscode-symbol-bridge/vsix
npm install
npm run package
```

생성 파일:

```bash
/home/kalstein/vscode/vscode-symbol-bridge/vsix/vscode-symbol-bridge-0.1.0.vsix
```

설치 방법:

- VS Code `Extensions` 화면에서 `Install from VSIX...` 선택
- 또는 아래 명령 실행

```bash
code --install-extension /home/kalstein/vscode/vscode-symbol-bridge/vsix/vscode-symbol-bridge-0.1.0.vsix
```

설치 후에는 대상 프로젝트를 `workspace folder`로 연 VS Code 창이 최소 하나 있어야 한다.
단일 파일 모드에서는 브릿지 서버가 열리지 않는다.

### 2. 개발/디버깅 설치

개발 중에는 이 저장소를 VS Code로 연 뒤 `Run Extension`으로 Extension Development Host를 실행한다.

## 구조

- `doc/`: 제품 요구사항 문서
- `doc/remaining_work.md`: 남은 작업과 재개 체크리스트
- `vsix/`: VS Code extension skeleton
- `skills/vscode-symbol-bridge/`: Cline skill + helper CLI skeleton

## 현재 상태

- Extension skeleton 추가
- Registry/IPC/protocol 타입 추가
- Skill 패키지와 `bin/vsb` helper CLI 추가

## 사용 방법

```bash
cd /home/kalstein/vscode/vscode-symbol-bridge
node skills/vscode-symbol-bridge/bin/vsb health
```

주요 예시:

```bash
node skills/vscode-symbol-bridge/bin/vsb health
node skills/vscode-symbol-bridge/bin/vsb workspace-symbol Foo --json
node skills/vscode-symbol-bridge/bin/vsb document-symbol --file sandbox/sample.cpp --json
node skills/vscode-symbol-bridge/bin/vsb definition --file sandbox/sample.cpp --line 5 --character 6 --json
```

참고:

- helper CLI는 현재 저장소 내부 `skills/vscode-symbol-bridge/bin/vsb`를 직접 실행하는 형태다.
- 전역 설치를 전제로 하지 않는다.
- 현재 작업 디렉터리와 registry를 기준으로 적절한 VS Code endpoint를 선택한다.

문제가 있을 때 빠르게 확인할 항목:

1. VS Code에 extension이 설치되어 있는지 확인
2. 대상 프로젝트가 단일 파일이 아니라 workspace folder로 열려 있는지 확인
3. `node skills/vscode-symbol-bridge/bin/vsb health`가 성공하는지 확인
4. endpoint가 여러 개면 `--workspace <path>`로 명시해서 선택

## 개발자 빠른 실행

```bash
cd /home/kalstein/vscode/vscode-symbol-bridge/vsix
npm install
npm run build
```

그 다음 VS Code에서 이 저장소를 열고 Extension Development Host를 실행한다.

## 테스트

단일 진입점:

```bash
./scripts/test.sh
```

개별 실행:

```bash
cd vsix && npm test
cd skills/vscode-symbol-bridge && npm test
```

통합 테스트:

```bash
./scripts/test-integration.sh
```

이 스크립트는 VS Code test host를 내려받아 `vsix/.vscode-test/` 아래에서 실행한다.

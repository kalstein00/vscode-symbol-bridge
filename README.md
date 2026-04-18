# vscode-symbol-bridge

VS Code가 이미 계산한 심볼 정보를 로컬 IPC로 외부 도구에 브릿지한다.

## 구조

- `doc/`: 제품 요구사항 문서
- `doc/remaining_work.md`: 남은 작업과 재개 체크리스트
- `vsix/`: VS Code extension skeleton
- `skills/vscode-symbol-bridge/`: Cline skill + helper CLI skeleton

## 현재 상태

- Extension skeleton 추가
- Registry/IPC/protocol 타입 추가
- Skill 패키지와 `bin/vsb` helper CLI 추가

## 빠른 실행

```bash
cd vsix
npm install
npm run build
```

그 다음 VS Code에서 이 저장소를 열고 extension development host를 실행한다.
host가 올라오면 저장소 루트에서 아래처럼 확인할 수 있다.

```bash
node skills/vscode-symbol-bridge/bin/vsb health
node skills/vscode-symbol-bridge/bin/vsb workspace-symbol Foo --json
node skills/vscode-symbol-bridge/bin/vsb document-symbol --file sandbox/sample.cpp --json
```

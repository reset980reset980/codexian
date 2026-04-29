# Sukgo Debate 개발 계획

이 문서는 Codexian의 현재 `숙고 사고` 기능을 다음 단계에서 확장하기 위한 개발 지시서다. 현재 구현은 단일 사고 도구를 선택하고 Codex CLI 한 번의 실행으로 Markdown 분석 노트를 저장하는 방식이다. 다음 목표는 모든 도구를 무조건 병렬화하는 것이 아니라, 병렬 토론이 실제로 유효한 도구에만 선택 가능한 실행 모드를 제공하는 것이다.

## 현재 상태

- 숙고 사고 패널은 현재 노트, 선택 텍스트, 고정 노트, 메모리 맵 관련 노트를 컨텍스트로 사용한다.
- 사용자는 하나의 사고 도구를 선택하고 `실행`을 누른다.
- Codexian은 현재 설정된 Codex 모델과 추론 수준으로 단일 분석을 실행한다.
- 결과는 `Sukgo/` 기본 폴더에 Markdown 노트로 저장된다.
- 외부 URL, 유튜브, 블로그, PDF, 논문 링크는 아직 자료로 수집하지 않는다. 현재는 사용자가 입력한 문자열 주제로만 취급될 수 있다.

## 목표

1. 도구별로 `단일 실행`, `병렬 토론`, `자동 선택` 실행 모드를 지원한다.
2. 병렬 토론이 유효한 도구에만 병렬 옵션을 노출한다.
3. 첫 구현은 Codex 내부 모델 병렬화로 시작한다.
4. 이후 Claude, z.ai, Gemini, OpenRouter, Ollama 등 provider 확장을 고려할 수 있는 구조로 설계한다.
5. 내부 Obsidian 노트뿐 아니라 외부 자료 URL도 근거로 수집할 수 있게 한다.
6. 결과 노트에는 근거와 추론을 분리하고, 내부 노트와 외부 출처 링크를 명확히 남긴다.

## 비목표

- 첫 단계에서 모든 provider를 동시에 구현하지 않는다.
- 모든 숙고 도구를 병렬 토론으로 바꾸지 않는다.
- Python `sukgo` CLI를 Obsidian 안에서 직접 실행하지 않는다.
- 브라우저 자동화, PDF 파서, 유튜브 transcript 수집을 한 번에 완성하려 하지 않는다.
- 기존 설정 키, 명령 ID, 저장된 사용자 설정을 깨지 않는다.

## 도구별 실행 방식

기본 분류:

| 도구 | 기본 실행 | 병렬 지원 | 이유 |
| --- | --- | --- | --- |
| 스틸맨 논증 | 병렬 토론 | 예 | 찬성/반대/중재 역할 분리가 유효함 |
| 악마의 대변인 | 병렬 토론 | 예 | 공격자/방어자/검증자 구조가 유효함 |
| 프리모템 | 병렬 토론 | 예 | 실패 원인을 역할별로 독립 탐색 가능 |
| 여섯 색깔 모자 | 병렬 토론 | 예 | 모자별 역할 분할이 자연스러움 |
| 의사결정 매트릭스 | 병렬 토론 | 예 | 기준 설계자/옵션 평가자/검증자 분리가 유효함 |
| 5 Whys | 단일 실행 | 아니오 | 선형 원인 추적 흐름이 더 적합함 |
| OODA 루프 | 단일 실행 | 선택적 | 빠른 순환 구조라 기본은 단일 실행 |
| 제1원리 사고 | 단일 실행 | 선택적 | 분해 후 재구성 흐름이 단일 실행에 적합함 |
| 툴민 논증 모델 | 단일 실행 | 선택적 | 논증 요소 분해는 단일 분석으로 충분한 경우가 많음 |
| 역발상 | 단일 실행 | 선택적 | 목표 반전 후 회피 목록 도출은 단일 실행으로 충분함 |

도구 정의에는 다음 메타데이터를 추가한다.

```ts
export type SukgoExecutionMode = 'single' | 'parallel' | 'auto';

export interface SukgoTool {
  id: string;
  name: string;
  shortDescription: string;
  prompt: string;
  supportsParallel: boolean;
  defaultExecutionMode: SukgoExecutionMode;
}
```

## 병렬 토론 프로필

병렬 토론은 `SukgoDebateProfile`로 정의한다. 첫 단계에서는 provider를 `codex`로 제한해도 되지만, 타입은 provider 확장을 막지 않게 둔다.

```ts
export type SukgoProviderId = 'codex' | 'claude' | 'zai' | 'openrouter' | 'ollama';

export interface SukgoDebateRole {
  id: string;
  name: string;
  provider: SukgoProviderId;
  model: string;
  reasoningEffort?: ReasoningEffort;
  systemPrompt: string;
  outputFocus: string;
}

export interface SukgoDebateProfile {
  id: string;
  name: string;
  description: string;
  roles: SukgoDebateRole[];
  synthesizer: SukgoDebateRole;
  maxRounds: number;
}
```

기본 프로필:

- **빠른 3인 토론**
  - 찬성자
  - 반대자
  - 중재자

- **깊은 5인 토론**
  - 찬성자
  - 반대자
  - 리스크 분석가
  - 실행 전략가
  - 근거 검증자
  - 별도 중재자

- **논문/자료 검토**
  - 요약자
  - 방법론 비판자
  - 적용 가능성 분석가
  - 근거 검증자
  - 중재자

## 실행 흐름

단일 실행:

1. 기존 `runSukgoAnalysis` 흐름을 유지한다.
2. 도구 프롬프트와 컨텍스트를 하나의 Codex 요청으로 실행한다.
3. 결과 노트를 저장한다.

병렬 토론:

1. 내부 노트와 외부 자료를 `EvidenceBundle`로 수집한다.
2. 선택한 `SukgoDebateProfile`의 각 역할을 병렬 실행한다.
3. 각 역할 결과를 `SukgoDebateResponse`로 저장한다.
4. 중재자 역할이 모든 응답을 받아 최종 결론을 작성한다.
5. 최종 노트에는 역할별 발언, 중재 결론, 남은 쟁점, 다음 행동을 포함한다.

```ts
export interface SukgoDebateResponse {
  roleId: string;
  roleName: string;
  provider: SukgoProviderId;
  model: string;
  content: string;
  errors: string[];
}
```

병렬 실행은 `Promise.allSettled`를 기본으로 한다. 일부 역할이 실패해도 중재자는 성공한 응답과 실패 정보를 함께 받아 결과를 작성해야 한다.

## 외부 자료 입력

외부 URL은 내부 노트와 같은 근거 계층으로 다룬다.

```ts
export type EvidenceSourceType = 'obsidian-note' | 'web-url' | 'youtube' | 'pdf' | 'paper';

export interface EvidenceSource {
  id: string;
  type: EvidenceSourceType;
  title: string;
  url?: string;
  path?: string;
  content: string;
  summary?: string;
  capturedAt: number;
}

export interface EvidenceBundle {
  topic: string;
  activeNote?: EvidenceSource;
  selectedText?: string;
  pinnedNotes: EvidenceSource[];
  relatedNotes: EvidenceSource[];
  externalSources: EvidenceSource[];
}
```

우선순위:

1. 일반 웹/블로그 URL 텍스트 추출
2. PDF URL 다운로드 후 텍스트 추출
3. arXiv/DOI/논문 페이지 메타데이터 및 초록 추출
4. YouTube transcript 추출

처음 구현할 때는 `ExternalEvidenceService`를 만들고, 각 source type별 파서를 느슨하게 분리한다. 파서가 실패하면 URL과 실패 이유를 결과 노트에 남긴다.

## UI 계획

숙고 패널에 추가할 항목:

- 실행 방식: `자동`, `단일`, `병렬 토론`
- 병렬 프로필 선택: `빠른 3인 토론`, `깊은 5인 토론`, `논문/자료 검토`, `사용자 정의`
- 외부 자료 URL 입력: 여러 줄 입력 허용
- URL 수집 옵션: `본문 요약 포함`, `원문 일부 포함`, `출처 링크만 포함`

도구가 `supportsParallel: false`이면 병렬 토론 옵션은 비활성화하거나 숨긴다. `자동`은 도구의 `defaultExecutionMode`를 따른다.

설정 화면에 추가할 항목:

- 기본 숙고 실행 방식
- 기본 병렬 토론 프로필
- 역할별 기본 모델
- 외부 URL 수집 사용 여부
- 외부 자료 최대 글자 수
- provider별 설정 영역

첫 단계에서는 Codex provider만 노출한다. Claude/z.ai 등은 provider 인터페이스를 만든 뒤 별도 단계에서 추가한다.

## Provider 확장 방향

공통 인터페이스:

```ts
export interface ModelProviderRequest {
  prompt: string;
  cwd: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  evidence: EvidenceBundle;
}

export interface ModelProvider {
  id: SukgoProviderId;
  displayName: string;
  query(request: ModelProviderRequest): AsyncGenerator<AgentEvent>;
}
```

첫 단계:

- 기존 `CodexProvider`를 재사용한다.
- 역할별 `model`, `reasoningEffort`를 임시 override할 수 있게 한다.

후속 단계:

- Claude CLI 또는 API provider
- z.ai provider
- OpenRouter provider
- Ollama/local provider

provider 추가 시 API 키 저장, CLI 경로, 네트워크 실패 처리, 비용 안내를 설정 화면에서 분리해야 한다.

## 결과 노트 형식

병렬 토론 결과 노트는 다음 구조를 권장한다.

```md
---
title: "숙고 토론 - 주제"
mode: codexian-sukgo-debate
tool: premortem
profile: deep-5
created: 2026-04-29T00:00:00.000Z
tags:
  - sukgo
  - sukgo/debate
  - codexian
---

# 숙고 토론 - 주제

> [!info]+ 출처
> - [[내부 노트]]
> - https://example.com/article

## 최종 결론

## 역할별 분석

### 찬성자

### 반대자

### 리스크 분석가

### 실행 전략가

### 근거 검증자

## 중재 및 종합

## 남은 질문

## 다음 행동

---

> [!quote]- 실행 메타데이터
> Provider/model/role 정보
```

## 구현 단계

### 1단계: 타입과 문서화된 실행 모드

- `SukgoTool`에 `supportsParallel`, `defaultExecutionMode` 추가
- UI에 실행 방식 선택 추가
- 병렬 미지원 도구는 단일 실행만 가능하게 처리
- 기존 단일 실행 동작 회귀 테스트

### 2단계: Codex 내부 병렬 토론

- `SukgoDebateProfile`, `SukgoDebateRole` 타입 추가
- 기본 프로필 2~3개 추가
- `runSukgoDebate` 서비스 추가
- `Promise.allSettled`로 역할별 Codex 요청 병렬 실행
- 중재자 통합 요청 추가
- 병렬 결과 Markdown 저장

### 3단계: 외부 URL 근거 수집

- `EvidenceBundle`, `EvidenceSource` 타입 추가
- 숙고 패널에 URL 입력 추가
- 일반 웹 URL 텍스트 추출부터 구현
- 실패한 URL은 결과 노트에 실패 이유 표시

### 4단계: provider 추상화

- `ModelProvider` 인터페이스 추가
- 기존 CodexProvider를 provider 인터페이스에 맞게 래핑
- 역할별 provider/model 설정 저장

### 5단계: Claude/z.ai 등 확장

- provider별 설정 영역 추가
- CLI/API 실행 방식 결정
- 인증/키/경로 검증 추가
- 실패 격리 및 비용 안내 추가

## 검증 기준

- 기존 단일 숙고 실행이 그대로 동작한다.
- 병렬 미지원 도구에서는 병렬 옵션이 선택되지 않는다.
- 병렬 지원 도구에서 역할별 결과가 일부 실패해도 최종 노트가 저장된다.
- 결과 노트에 provider, model, role, source 정보가 남는다.
- 외부 URL 수집 실패가 전체 숙고 실행 실패로 이어지지 않는다.
- `npm run typecheck`, `npm run build`, `git diff --check`가 통과한다.

## 주의사항

- 병렬 실행은 비용과 실행 시간이 늘어난다. UI에서 이 사실을 명확히 보여줘야 한다.
- 외부 URL 수집은 저작권과 약관 이슈가 있을 수 있으므로, 전체 원문 저장보다 요약과 출처 링크 중심으로 시작한다.
- 모바일 Obsidian은 Codex CLI 실행과 일부 플러그인 환경이 다르므로 데스크톱 우선으로 개발한다.
- 기존 사용자의 `data.json` 설정을 깨지 않도록 새 설정은 모두 기본값을 제공한다.

# Codexian

Obsidian 안에서 OpenAI Codex CLI를 실행하는 데스크톱 전용 플러그인입니다. 활성 노트 컨텍스트, 메모리 맵, 시각 자료 생성, 숙고 사고 도구, Codex/OMX 설치 보조 기능을 Obsidian 사이드바에서 바로 사용할 수 있습니다.

<p align="center">
  <a href="https://www.youtube.com/@%EB%B0%B0%EC%9B%80%EC%9D%98%EB%8B%AC%EC%9D%B8-p5v">
    <img alt="YouTube: 배움의 달인" src="https://img.shields.io/badge/YouTube-%EB%B0%B0%EC%9B%80%EC%9D%98%20%EB%8B%AC%EC%9D%B8-FF0000?style=for-the-badge&logo=youtube&logoColor=white">
  </a>
  <a href="https://x.com/reallygood83">
    <img alt="X: @reallygood83" src="https://img.shields.io/badge/X-@reallygood83-000000?style=for-the-badge&logo=x&logoColor=white">
  </a>
</p>

Codexian은 인증된 Codex CLI 세션을 감싸서 ObsidianCode 같은 에이전트 사이드바 경험을 제공합니다. 일반 사용에는 OpenAI API 키가 필요하지 않고, Codex CLI 로그인 상태를 그대로 사용합니다.

## 현재 릴리스

최신 BRAT 릴리스: **0.2.18**

BRAT 설치 URL:

```text
https://github.com/reallygood83/codexian
```

## 주요 기능

- **Obsidian 안의 Codex 사이드바**: ObsidianCode 스타일 UI에서 Codex와 대화합니다.
- **노트 컨텍스트 자동 첨부**: 활성 노트, 선택 텍스트, 고정 노트를 Codex 프롬프트에 자동 포함할 수 있습니다.
- **고정/제외 가능한 노트 칩**: `+`로 관련 노트를 컨텍스트에 추가하고, `x`로 제외합니다.
- **메모리 맵**: 볼트를 로컬로 색인하고 현재 노트와 관련된 노트를 추천합니다.
- **숙고 사고**: 스틸맨 논증, 악마의 대변인, 프리모템, 여섯 색깔 모자, 역발상, 5 Whys, 의사결정 매트릭스, 제1원리 사고, OODA 루프, 툴민 논증 모델을 실행합니다.
- **시각 자료 생성**: 현재 노트를 분석해 PNG 또는 SVG 시각 자료를 생성하고 노트에 삽입합니다.
- **Codex 작업 단계 표시**: Codex CLI 진행 메시지를 타임라인으로 보여줍니다.
- **슬래시 명령 메뉴**: 입력창에서 `/`를 입력하면 Codex 스타일 명령 메뉴가 열립니다.
- **모델/추론/권한 설정**: 모델, 추론 수준, 검토/자동/무제한 권한 모드를 설정합니다.
- **한글화된 메뉴와 설정**: 명령 팔레트, 사이드바, 설정 화면, 모달, 알림, README가 한국어 기준으로 정리되어 있습니다.
- **Windows 대응 Codex 실행**: `codex.cmd` 실행 문제가 있을 때 내부적으로 `@openai/codex/bin/codex.js`를 `node`로 실행합니다.

## 숙고 사고

숙고 사고는 [`sukgo`](https://github.com/reallygood83/sukgo)의 의사결정/사고 프레임워크를 Codexian 안에 네이티브로 결합한 기능입니다.

Python `sukgo` CLI를 직접 실행하지 않습니다. 대신 Codexian의 Codex/provider 연결, 활성 노트, 선택 텍스트, 고정 노트, 메모리 맵 관련 노트, 외부 URL 근거를 함께 보내 Obsidian Markdown 분석 노트를 생성합니다.

포함된 도구:

- 스틸맨 논증
- 악마의 대변인
- 프리모템
- 여섯 색깔 모자
- 역발상
- 5 Whys
- 의사결정 매트릭스
- 제1원리 사고
- OODA 루프
- 툴민 논증 모델

사용 흐름:

1. 노트를 열거나 `숙고 사고` 패널에 직접 주제를 입력합니다.
2. 사고 도구를 선택합니다.
3. 실행 방식을 `단일 실행`, `병렬 토론`, `자동 선택` 중에서 고릅니다.
4. 필요한 경우 외부 자료 URL을 여러 줄로 입력합니다.
5. **실행**을 누릅니다.
6. Codexian이 내부 노트와 외부 자료를 근거 번들로 묶어 선택한 provider에 전달합니다.
7. 결과가 설정된 숙고 출력 폴더에 Markdown 노트로 저장되고 자동으로 열립니다.

병렬 토론:

- 기본 프로필은 `빠른 3인 토론`, `깊은 5인 토론`, `논문/자료 검토`입니다.
- 병렬이 맞지 않는 도구에서는 병렬 토론 옵션이 비활성화됩니다.
- 일부 역할이 실패해도 성공한 역할 응답과 실패 정보를 함께 중재해 결과 노트를 저장합니다.

외부 자료:

- 일반 웹/블로그 URL, PDF URL, arXiv/논문 페이지, YouTube 링크를 근거로 수집합니다.
- 기본값은 요약과 출처 링크 중심이며, 설정에서 원문 일부 포함 또는 링크만 포함으로 바꿀 수 있습니다.
- URL 수집 실패는 전체 숙고 실행 실패로 이어지지 않고 결과 노트에 오류로 남습니다.

Provider:

- 기본 provider는 Codex입니다.
- 설정에서 Claude CLI, z.ai, Gemini, OpenRouter, Ollama를 선택할 수 있습니다.
- API 기반 provider는 환경 변수 영역에 키를 넣고, 설정에서 키 이름과 모델/엔드포인트를 지정합니다.

기본 출력 폴더:

```text
Sukgo/
```

명령 팔레트:

- `Codexian: 숙고 사고 도구 실행`
- `Codexian: 숙고: 스틸맨 논증`
- `Codexian: 숙고: 악마의 대변인`
- `Codexian: 숙고: 프리모템`
- `Codexian: 숙고: 여섯 색깔 모자`
- `Codexian: 숙고: 역발상`
- `Codexian: 숙고: 5 Whys`
- `Codexian: 숙고: 의사결정 매트릭스`
- `Codexian: 숙고: 제1원리 사고`
- `Codexian: 숙고: OODA 루프`
- `Codexian: 숙고: 툴민 논증 모델`

## 메모리 맵

메모리 맵은 API 없이 로컬에서 관련 노트를 찾는 기능입니다.

사용 흐름:

1. **메모리 맵 빌드**를 한 번 눌러 볼트를 색인합니다.
2. 아무 노트나 엽니다.
3. **컨텍스트 찾기**를 누릅니다.
4. Codexian이 관련 노트를 추천하고 추천 이유를 표시합니다.
5. 필요한 노트는 `+`로 Codexian 컨텍스트에 추가합니다.

메모리 맵은 노트 제목, 태그, 링크, 백링크, 헤딩, 키워드, 폴더, 수정 시간, URL 노이즈 필터링, BM25 스타일 용어 점수를 사용합니다.

로컬 저장 위치:

```text
.codexian/memory/index.json
```

명령 팔레트:

- `Codexian: 메모리 맵 빌드`
- `Codexian: 현재 노트 관련 노트 찾기`

## 시각 자료 생성

Codexian은 현재 노트에서 PNG 또는 SVG 시각 자료를 생성하고 노트 상단에 삽입할 수 있습니다.

지원 형식:

- 인포그래픽
- 포스터
- 카툰 / 스토리보드
- 컨셉 아트
- 다이어그램 일러스트
- 유튜브 썸네일
- 프로필 / 아바타
- 제품 마케팅
- 이커머스 히어로 이미지
- UI / 앱 목업

사용 흐름:

1. 노트를 엽니다.
2. Codexian 사이드바의 이미지 버튼을 누릅니다.
3. `Codex 이미지 생성으로 PNG` 또는 `Codex 코드 생성으로 SVG`를 선택합니다.
4. 시각 자료 형식을 선택합니다.
5. Codexian이 노트를 분석해 이미지 프롬프트 초안을 작성합니다.
6. 프롬프트를 검토하거나 수정합니다.
7. Codexian이 파일을 생성하고 노트에 삽입합니다.

참고:

- PNG는 Codex CLI 내장 `image_generation`을 사용합니다.
- SVG는 Codex CLI가 텍스트 안전 SVG 파일을 작성합니다.
- 생성 파일은 설정의 미디어 폴더에 저장됩니다.
- YAML frontmatter/properties 아래에 삽입되어 Obsidian 속성을 깨지 않습니다.
- 한국어 라벨이 깨질 가능성을 줄이도록 프롬프트 작성 단계에 한국어 지시를 포함합니다.

## 설정

Obsidian 설정 -> 커뮤니티 플러그인 -> Codexian에서 설정합니다.

설정 항목:

- **Codex CLI 경로**: 자동 감지가 실패할 때만 직접 지정합니다.
- **모델**: 사용할 Codex 모델 ID를 지정합니다.
- **추론 수준**: 낮음, 보통, 높음, 매우 높음 중 선택합니다.
- **권한 모드**: 검토, 자동, 무제한 중 선택합니다. 처음에는 검토 모드를 권장합니다.
- **활성 노트 자동 포함**: 현재 열린 Markdown 노트를 모든 Codex 프롬프트에 자동 첨부합니다.
- **환경 변수**: Obsidian이 `codex`, `npm`, `git`, `omx`를 찾지 못할 때 `PATH` 등을 설정합니다.
- **미디어 폴더**: 생성된 PNG/SVG 시각 자료 저장 위치입니다.
- **숙고 출력 폴더**: 숙고 사고 결과 노트 저장 위치입니다.
- **기본 숙고 실행 방식**: 단일 실행, 병렬 토론, 자동 선택 중에서 고릅니다.
- **기본 병렬 토론 프로필**: 빠른 3인, 깊은 5인, 논문/자료 검토 중에서 고릅니다.
- **숙고 provider**: Codex, Claude CLI, z.ai, Gemini, OpenRouter, Ollama 중에서 선택합니다.
- **외부 URL 근거 수집**: URL 수집 사용 여부, 포함 방식, 최대 글자 수를 설정합니다.
- **provider별 모델/엔드포인트**: API 키 환경 변수 이름, 모델 ID, 로컬/원격 엔드포인트를 설정합니다.

설치/업데이트 보조 기능:

- **진단 실행**: Obsidian이 `codex`, `npm`, `node`, `git`, `omx`를 찾는지 확인합니다.
- **Codex + OMX 설치/업데이트**: `@openai/codex`와 `oh-my-codex`를 설치한 뒤 `omx setup`, `omx doctor`를 실행합니다.
- **Codex CLI 업데이트**: `npm install -g @openai/codex@latest`를 실행합니다.
- **이미지 생성 활성화**: `codex features enable image_generation`을 실행합니다.
- **Obsidian Skills 설치/업데이트**: [`kepano/obsidian-skills`](https://github.com/kepano/obsidian-skills)를 `~/.codex/skills`에 설치합니다.

## 노트 컨텍스트 워크플로

- 노트를 열면 Codexian이 자동으로 감지합니다.
- 핀 아이콘으로 파일을 바꿔도 계속 붙어 있을 노트를 고정합니다.
- `x`로 특정 노트를 현재 대화 컨텍스트에서 제외합니다.
- 명령 팔레트에서 `Codexian: 현재 노트를 채팅에 첨부`를 실행하거나 단축키에 연결할 수 있습니다.
- 일반적으로 질문하면 Codexian이 선택된 노트 컨텍스트를 Codex CLI로 전달합니다.

## 요구사항

- Obsidian 데스크톱
- Node.js 20 이상
- Git
- 설치 및 로그인된 OpenAI Codex CLI
- PNG 시각 자료 생성을 위한 최신 Codex CLI와 `image_generation` 기능
- 선택: 고급 OMX 워크플로를 위한 oh-my-codex

권장 CLI 설정:

```bash
npm install -g @openai/codex oh-my-codex
codex login
codex features enable image_generation
omx setup
omx doctor
```

플랫폼 참고:

- **macOS**: Homebrew, npm, NVM Codex 경로를 자동 감지합니다.
- **Windows**: `%APPDATA%\npm\codex.cmd` 같은 npm 경로를 자동 감지합니다. `.cmd` 래퍼가 Node spawn 문제를 만들면 내부적으로 `codex.js` 엔트리포인트를 `node`로 실행합니다.
- **Windows PowerShell**: 수동 설정 명령에 권장됩니다.
- **Windows WSL**: 네이티브 터미널 도구가 불안정할 때 고급 OMX/team 워크플로의 실용적인 대안입니다.

## BRAT 설치

Codexian은 GitHub 릴리스 기반 BRAT 설치를 지원합니다.

1. Obsidian 커뮤니티 플러그인에서 **Obsidian42 - BRAT**을 설치합니다.
2. BRAT 설정을 엽니다.
3. **Add Beta Plugin**을 누릅니다.
4. 저장소 URL을 붙여넣습니다.

```text
https://github.com/reallygood83/codexian
```

5. Obsidian 커뮤니티 플러그인에서 **Codexian**을 활성화합니다.

각 릴리스에는 BRAT에 필요한 파일이 포함됩니다.

- `main.js`
- `manifest.json`
- `styles.css`

BRAT이 즉시 업데이트하지 않으면 BRAT의 플러그인 업데이트 명령을 실행하거나 Obsidian을 다시 시작하세요.

## 개발

```bash
npm install
npm run build
```

로컬 개발 설치 위치:

```text
<vault>/.obsidian/plugins/codexian/
  main.js
  manifest.json
  styles.css
```

그 뒤 Obsidian 설정에서 **Codexian**을 활성화합니다.

## 릴리스 워크플로

이 저장소에는 manifest 버전과 일치하는 태그가 push될 때 BRAT 산출물을 빌드하고 업로드하는 GitHub Actions 워크플로가 포함되어 있습니다.

예:

```bash
git tag 0.2.18
git push origin 0.2.18
```

## 보안 참고

- 기본값으로는 검토 모드가 가장 안전합니다.
- 자동 모드는 Codex full-auto 동작에 대응합니다.
- 무제한 모드는 승인과 샌드박스를 우회하므로 신뢰할 수 있고 백업된 볼트에서만 사용하세요.
- 원클릭 설치 도구는 명령 미리보기와 실행 로그를 보여줍니다.
- 시각 자료 생성은 파일이 실제로 생성된 뒤에만 현재 노트를 수정합니다.

## 프로젝트 상태

Codexian은 MVP 단계에서 활발히 개발 중입니다. 현재 초점:

- Codex CLI 슬래시 명령과의 더 나은 호환성
- 시각 자료 생성 워크플로 안정화
- 외부 자료 수집 안정화와 provider별 UX 개선
- 도구 호출과 diff 미리보기 렌더링 개선
- 장기 대화 지속성

## 크레딧

[배움의 달인](https://www.youtube.com/@%EB%B0%B0%EC%9B%80%EC%9D%98%EB%8B%AC%EC%9D%B8-p5v) / [@reallygood83](https://x.com/reallygood83)이 만들었습니다.

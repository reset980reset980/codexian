import type { ReasoningEffort, SukgoProviderId } from '../types';

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

export interface SukgoDebateResponse {
  roleId: string;
  roleName: string;
  provider: SukgoProviderId;
  model: string;
  content: string;
  errors: string[];
}

const codexRole = (
  id: string,
  name: string,
  systemPrompt: string,
  outputFocus: string,
  reasoningEffort?: ReasoningEffort,
): SukgoDebateRole => ({
  id,
  name,
  provider: 'codex',
  model: '',
  reasoningEffort,
  systemPrompt,
  outputFocus,
});

export const SUKGO_DEBATE_PROFILES: SukgoDebateProfile[] = [
  {
    id: 'quick-3',
    name: '빠른 3인 토론',
    description: '찬성, 반대, 중재 관점으로 빠르게 쟁점을 나눕니다.',
    maxRounds: 1,
    roles: [
      codexRole('advocate', '찬성자', 'Defend the strongest useful version of the topic.', '실행 가능성과 장점'),
      codexRole('critic', '반대자', 'Challenge the topic with direct but fair objections.', '위험, 반례, 약한 가정'),
      codexRole('mediator', '중재자', 'Compare the strongest points from both sides.', '타협안과 판단 기준'),
    ],
    synthesizer: codexRole(
      'synthesizer',
      '종합 중재자',
      'Synthesize the debate into a balanced decision note.',
      '최종 결론, 남은 쟁점, 다음 행동',
      'high',
    ),
  },
  {
    id: 'deep-5',
    name: '깊은 5인 토론',
    description: '리스크, 실행, 검증 관점을 추가해 더 깊게 검토합니다.',
    maxRounds: 1,
    roles: [
      codexRole('advocate', '찬성자', 'Argue for the best case and practical upside.', '성공 조건과 기대 효과'),
      codexRole('critic', '반대자', 'Argue against the topic with the strongest objections.', '실패 가능성과 반대 근거'),
      codexRole('risk', '리스크 분석가', 'Identify operational, strategic, and hidden risks.', '조기 경보와 완화책'),
      codexRole('operator', '실행 전략가', 'Turn the topic into concrete execution paths.', '단계, 의존성, 우선순위'),
      codexRole('verifier', '근거 검증자', 'Separate supported evidence from assumptions.', '근거 수준과 검증 질문'),
    ],
    synthesizer: codexRole(
      'synthesizer',
      '종합 중재자',
      'Integrate all role outputs into a rigorous final recommendation.',
      '판단, 조건부 결론, 다음 행동',
      'high',
    ),
  },
  {
    id: 'research-review',
    name: '논문/자료 검토',
    description: '자료 요약, 방법론, 적용 가능성, 근거 검증을 분리합니다.',
    maxRounds: 1,
    roles: [
      codexRole('summarizer', '요약자', 'Summarize the source material and central claims.', '핵심 주장과 맥락'),
      codexRole('methodologist', '방법론 비판자', 'Critique methodology, missing controls, and inference quality.', '방법론 한계'),
      codexRole('applicability', '적용 가능성 분석가', 'Assess whether the claims transfer to the user context.', '적용 조건과 제약'),
      codexRole('verifier', '근거 검증자', 'Track evidence quality and unsupported leaps.', '근거와 추론 분리'),
    ],
    synthesizer: codexRole(
      'synthesizer',
      '중재자',
      'Synthesize the review into a practical research note.',
      '신뢰도, 적용 판단, 추가 확인',
      'high',
    ),
  },
];

export function getSukgoDebateProfile(id: string): SukgoDebateProfile {
  return SUKGO_DEBATE_PROFILES.find((profile) => profile.id === id) || SUKGO_DEBATE_PROFILES[0];
}

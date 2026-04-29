import type { SukgoExecutionMode } from '../types';

export interface SukgoTool {
  id: string;
  name: string;
  shortDescription: string;
  prompt: string;
  supportsParallel: boolean;
  defaultExecutionMode: SukgoExecutionMode;
}

export const SUKGO_TOOLS: SukgoTool[] = [
  {
    id: 'steelman',
    name: '스틸맨 논증',
    shortDescription: '가장 강한 반대 논리를 구성합니다.',
    supportsParallel: true,
    defaultExecutionMode: 'parallel',
    prompt: [
      'Act as a rigorous debate coach.',
      'Create the strongest steel-man argument against or around the user topic.',
      'Return: 3 strongest counterarguments, evidence each would need, questions the user must answer, and a balanced assessment.',
    ].join('\n'),
  },
  {
    id: 'devil',
    name: '악마의 대변인',
    shortDescription: '약한 가정과 허점을 직접 공격합니다.',
    supportsParallel: true,
    defaultExecutionMode: 'parallel',
    prompt: [
      'Act as a direct but fair Devil\'s Advocate.',
      'Identify the strongest objections, hidden assumptions, and failure points in the user topic.',
      'Return: 5 attacks, the single most dangerous objection, likely consequence if ignored, and immediate defenses.',
    ].join('\n'),
  },
  {
    id: 'premortem',
    name: '프리모템',
    shortDescription: '실패를 가정하고 원인을 역추적합니다.',
    supportsParallel: true,
    defaultExecutionMode: 'parallel',
    prompt: [
      'Act as a pre-mortem facilitator using Gary Klein-style prospective hindsight.',
      'Assume the decision or plan failed one year later.',
      'Return: failure story, top 5 failure causes, early warning signals, prevention actions, and current risk score.',
    ].join('\n'),
  },
  {
    id: '6hats',
    name: '여섯 색깔 모자',
    shortDescription: '여섯 가지 사고 모드로 분석합니다.',
    supportsParallel: true,
    defaultExecutionMode: 'parallel',
    prompt: [
      'Act as an Edward de Bono Six Thinking Hats facilitator.',
      'Analyze the topic through white, red, black, yellow, green, and blue hats.',
      'Keep each hat distinct, then synthesize the next decision step.',
    ].join('\n'),
  },
  {
    id: 'inversion',
    name: '역발상',
    shortDescription: '목표를 뒤집어 피해야 할 실수를 드러냅니다.',
    supportsParallel: true,
    defaultExecutionMode: 'single',
    prompt: [
      'Act as a Charlie Munger-style inversion coach.',
      'Invert the user goal: ask how to guarantee failure, then reverse those failure paths into concrete avoidances.',
      'Return: inverted question, 5 failure methods, avoid list, non-obvious insight, and immediate stop/start actions.',
    ].join('\n'),
  },
  {
    id: '5whys',
    name: '5 Whys',
    shortDescription: '문제를 근본 원인까지 추적합니다.',
    supportsParallel: false,
    defaultExecutionMode: 'single',
    prompt: [
      'Act as a Toyota-style 5 Whys root-cause analyst.',
      'Run five levels of why, checking whether each answer is sufficient or only superficial.',
      'Return: the chain, likely root cause, validation checks, and root-cause actions.',
    ].join('\n'),
  },
  {
    id: 'matrix',
    name: '의사결정 매트릭스',
    shortDescription: '가중 기준으로 선택지를 비교합니다.',
    supportsParallel: true,
    defaultExecutionMode: 'parallel',
    prompt: [
      'Act as a decision analyst.',
      'If options or criteria are missing, infer reasonable candidates and mark them as assumptions.',
      'Return: options, weighted criteria, score table, recommendation, sensitivity risks, and one key missing datum.',
    ].join('\n'),
  },
  {
    id: 'principles',
    name: '제1원리 사고',
    shortDescription: '가정을 기초 원리까지 분해합니다.',
    supportsParallel: true,
    defaultExecutionMode: 'single',
    prompt: [
      'Act as a first-principles reasoning coach.',
      'Separate assumptions, facts, analogies, and constraints.',
      'Return: assumption breakdown, foundational truths, rebuilt approach, non-obvious possibilities, and next action.',
    ].join('\n'),
  },
  {
    id: 'ooda',
    name: 'OODA 루프',
    shortDescription: '관찰-판단-결정-행동으로 빠른 결정을 구조화합니다.',
    supportsParallel: true,
    defaultExecutionMode: 'single',
    prompt: [
      'Act as an OODA Loop operator.',
      'Analyze the topic through Observe, Orient, Decide, Act, then define when to loop again.',
      'Prioritize speed, evidence, reversibility, and feedback signals.',
    ].join('\n'),
  },
  {
    id: 'toulmin',
    name: '툴민 논증 모델',
    shortDescription: '주장을 논증 구조로 분해합니다.',
    supportsParallel: true,
    defaultExecutionMode: 'single',
    prompt: [
      'Act as a Toulmin argument analyst.',
      'Break the topic into claim, data, warrant, backing, rebuttal, and qualifier.',
      'Return the weakest link, how to strengthen it, and a more defensible revised claim.',
    ].join('\n'),
  },
];

export function getSukgoTool(id: string): SukgoTool | null {
  return SUKGO_TOOLS.find((tool) => tool.id === id) || null;
}

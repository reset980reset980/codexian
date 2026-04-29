export interface SukgoTool {
  id: string;
  name: string;
  shortDescription: string;
  prompt: string;
}

export const SUKGO_TOOLS: SukgoTool[] = [
  {
    id: 'steelman',
    name: 'Steel-manning',
    shortDescription: 'Build the strongest opposing argument.',
    prompt: [
      'Act as a rigorous debate coach.',
      'Create the strongest steel-man argument against or around the user topic.',
      'Return: 3 strongest counterarguments, evidence each would need, questions the user must answer, and a balanced assessment.',
    ].join('\n'),
  },
  {
    id: 'devil',
    name: "Devil's Advocate",
    shortDescription: 'Attack weak assumptions directly.',
    prompt: [
      'Act as a direct but fair Devil\'s Advocate.',
      'Identify the strongest objections, hidden assumptions, and failure points in the user topic.',
      'Return: 5 attacks, the single most dangerous objection, likely consequence if ignored, and immediate defenses.',
    ].join('\n'),
  },
  {
    id: 'premortem',
    name: 'Pre-mortem',
    shortDescription: 'Assume failure and trace causes.',
    prompt: [
      'Act as a pre-mortem facilitator using Gary Klein-style prospective hindsight.',
      'Assume the decision or plan failed one year later.',
      'Return: failure story, top 5 failure causes, early warning signals, prevention actions, and current risk score.',
    ].join('\n'),
  },
  {
    id: '6hats',
    name: '6 Hats',
    shortDescription: 'Analyze through six thinking modes.',
    prompt: [
      'Act as an Edward de Bono Six Thinking Hats facilitator.',
      'Analyze the topic through white, red, black, yellow, green, and blue hats.',
      'Keep each hat distinct, then synthesize the next decision step.',
    ].join('\n'),
  },
  {
    id: 'inversion',
    name: 'Inversion',
    shortDescription: 'Reverse the goal to expose avoidable mistakes.',
    prompt: [
      'Act as a Charlie Munger-style inversion coach.',
      'Invert the user goal: ask how to guarantee failure, then reverse those failure paths into concrete avoidances.',
      'Return: inverted question, 5 failure methods, avoid list, non-obvious insight, and immediate stop/start actions.',
    ].join('\n'),
  },
  {
    id: '5whys',
    name: '5 Whys',
    shortDescription: 'Trace a problem to root causes.',
    prompt: [
      'Act as a Toyota-style 5 Whys root-cause analyst.',
      'Run five levels of why, checking whether each answer is sufficient or only superficial.',
      'Return: the chain, likely root cause, validation checks, and root-cause actions.',
    ].join('\n'),
  },
  {
    id: 'matrix',
    name: 'Decision Matrix',
    shortDescription: 'Compare options with weighted criteria.',
    prompt: [
      'Act as a decision analyst.',
      'If options or criteria are missing, infer reasonable candidates and mark them as assumptions.',
      'Return: options, weighted criteria, score table, recommendation, sensitivity risks, and one key missing datum.',
    ].join('\n'),
  },
  {
    id: 'principles',
    name: 'First Principles',
    shortDescription: 'Break assumptions down to fundamentals.',
    prompt: [
      'Act as a first-principles reasoning coach.',
      'Separate assumptions, facts, analogies, and constraints.',
      'Return: assumption breakdown, foundational truths, rebuilt approach, non-obvious possibilities, and next action.',
    ].join('\n'),
  },
  {
    id: 'ooda',
    name: 'OODA Loop',
    shortDescription: 'Frame fast decisions as observe-orient-decide-act.',
    prompt: [
      'Act as an OODA Loop operator.',
      'Analyze the topic through Observe, Orient, Decide, Act, then define when to loop again.',
      'Prioritize speed, evidence, reversibility, and feedback signals.',
    ].join('\n'),
  },
  {
    id: 'toulmin',
    name: 'Toulmin Model',
    shortDescription: 'Decompose an argument into claim structure.',
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

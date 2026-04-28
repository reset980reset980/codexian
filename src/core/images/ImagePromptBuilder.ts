import type { ImageMode, VisualOutputType } from '../types';

const MODE_DIRECTIVES: Record<ImageMode, string> = {
  infographic: 'Clean educational infographic with a central hero visual, multiple labeled callouts, structured information blocks, precise diagram layout, readable typography, balanced spacing, professional editorial design, crisp iconography, and high information density.',
  poster: 'Premium product or brand marketing poster with a hero-centered composition, luxury editorial styling, polished material rendering, clean brand typography area, sophisticated palette, high-end commercial lighting, subtle background texture, and campaign-ready visual quality.',
  cartoon: 'Cinematic character sheet or storyboard with consistent design language, expressive poses, multi-panel layout, labeled costume or prop details, dynamic framing, stylized linework, and strong visual storytelling.',
  concept: 'Create concept art with cinematic composition, atmosphere, and clear subject focus.',
  diagram: 'Create a diagram-like illustration that explains relationships visually without looking like a generic flowchart.',
  thumbnail: 'Bold YouTube thumbnail with a dramatic focal subject, strong headline area, high contrast colors, attention-grabbing composition, expressive emotion, layered graphic elements, clear readable text space, and energetic creator aesthetic.',
  avatar: 'Polished portrait or profile avatar with centered composition, clean background, expressive face, premium editorial photography or stylized illustration, natural texture, soft cinematic lighting, high detail, and clear focal separation.',
  product: 'Premium product marketing poster with hero shot composition, luxury editorial styling, polished material rendering, sophisticated color palette, high-end commercial lighting, subtle background texture, and brand campaign quality.',
  ecommerce: 'E-commerce hero image with clean isolated composition, premium studio lighting, realistic material detail, conversion-focused layout, tidy product hierarchy, optional feature badges, soft shadow grounding, and polished online retail aesthetic.',
  ui: 'High-fidelity UI mockup with realistic mobile or desktop frame, rich interface hierarchy, detailed widgets and controls, modern product design language, polished screen glow, realistic spacing system, dense but readable layout, and startup-grade product presentation.',
};

const DEFAULT_ASPECT_RATIO: Record<ImageMode, string> = {
  infographic: 'landscape or square depending on note density',
  poster: 'portrait',
  cartoon: 'landscape for storyboard, square for character scene',
  concept: 'landscape',
  diagram: 'landscape',
  thumbnail: 'landscape',
  avatar: 'square',
  product: 'portrait or square',
  ecommerce: 'square',
  ui: 'landscape',
};

export function buildImagePrompt(options: {
  mode: ImageMode;
  outputType?: VisualOutputType;
  userPrompt: string;
  noteTitle?: string;
  noteContent?: string;
  selection?: string;
}): string {
  const source = options.selection || options.noteContent || '';
  const parts = [
    MODE_DIRECTIVES[options.mode],
    'Use the provided Obsidian note context as source material. Preserve meaning, but do not cram all text into the image.',
    'Build the prompt with this structure: subject, composition, style, environment, lighting, typography, details, aspect_ratio.',
    `Use aspect_ratio: ${DEFAULT_ASPECT_RATIO[options.mode]} unless the user explicitly requests another ratio.`,
  ];

  if (options.noteTitle) {
    parts.push(`Note title: ${options.noteTitle}`);
  }

  if (source.trim()) {
    parts.push(`Source context:\n${source.slice(0, 6000)}`);
  }

  if (options.userPrompt.trim()) {
    parts.push(`User direction:\n${options.userPrompt.trim()}`);
  }

  parts.push('If the user gives only a short feeling or result direction, infer the best category and fill in composition, focal subject, lighting, color tone, text space, and aspect ratio automatically.');
  parts.push('Avoid tiny unreadable text. Prefer visual synthesis, clear composition, and a premium OpenAI-adjacent monochrome/green design language when appropriate.');
  if (options.outputType === 'png') {
    parts.push('For Korean text in the PNG image, use only short, large, high-contrast Korean labels. Avoid long paragraphs, tiny captions, and garbled placeholder glyphs.');
  } else {
    parts.push('For Korean text, use concise Korean labels and specify font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif. Do not convert Korean text into broken outlines or garbled Latin placeholders.');
  }
  return parts.join('\n\n');
}

export function buildPromptDraftRequest(options: {
  mode: ImageMode;
  outputType: VisualOutputType;
  userPrompt: string;
  noteTitle?: string;
  noteContent?: string;
  selection?: string;
}): string {
  const source = options.selection || options.noteContent || '';
  const outputDescription = options.outputType === 'png'
    ? 'a high-quality PNG image using Codex built-in image generation'
    : 'one text-safe SVG visual asset';
  return [
    `Analyze the provided Obsidian note and write a production-ready prompt for generating ${outputDescription}.`,
    '',
    'Use the GPT Image 2 practical prompt recipe: category selection -> structure selection -> variable filling.',
    'If the user only gives a short result feeling, infer the missing visual variables instead of asking them to write a prompt.',
    '',
    'Output only the final image-generation prompt. Do not include commentary, markdown fences, or alternatives.',
    '',
    'The prompt must include:',
    `- Category / visual format: ${options.mode}`,
    `- aspect_ratio: ${DEFAULT_ASPECT_RATIO[options.mode]} unless the user explicitly asks otherwise`,
    '- subject: what should be drawn',
    '- composition: how the subject, headline area, callouts, panels, or UI regions are arranged',
    '- style: the aesthetic direction such as editorial infographic, YouTube thumbnail, premium poster, polished UI mockup, storyboard, profile image, or retail hero image',
    '- environment: background, location, or screen context',
    '- lighting: soft cinematic, commercial studio, warm diffused, high contrast, or screen glow as appropriate',
    '- typography: whether text/labels/headline space are needed and how readability is protected',
    '- details: materials, props, badges, icons, texture, mood, and finish',
    '- The core message extracted from the note',
    '- Recommended composition/layout',
    '- 3 to 7 concise Korean labels if labels are useful',
    '- Clear instruction to preserve Korean text legibility',
    options.outputType === 'svg'
      ? '- SVG-safe typography using Pretendard, Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif'
      : '- Keep any Korean text short, large, high contrast, and easy to verify',
    '- Avoidance of tiny text, clutter, and garbled Korean',
    '',
    'Category recipes to apply when relevant:',
    '- YouTube thumbnail: dramatic focal subject, strong headline area, high contrast, expressive emotion, layered graphics, landscape.',
    '- Educational infographic: central hero visual, labeled callouts, structured blocks, legend/steps, balanced spacing, crisp icons.',
    '- Product/brand poster: hero-centered composition, luxury editorial styling, brand typography area, sophisticated palette, commercial lighting.',
    '- E-commerce hero: isolated product hierarchy, studio lighting, feature badges, soft shadow, conversion-focused layout.',
    '- UI mockup: realistic device/desktop frame, interface hierarchy, detailed widgets, dense but readable spacing.',
    '- Cartoon/storyboard: consistent character style, multi-panel layout, action frame, caption boxes, expressive poses.',
    '- Profile/avatar: centered portrait, clean backdrop, expressive face, soft rim light, polished texture.',
    '',
    options.noteTitle ? `Note title: ${options.noteTitle}` : '',
    source.trim() ? `Source note:\n${source.slice(0, 7000)}` : '',
    options.userPrompt.trim() ? `User direction:\n${options.userPrompt.trim()}` : '',
  ].filter(Boolean).join('\n\n');
}

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

export function anthropic(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

export function openai(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// Sonnet 4.6 is the workhorse for the Multi-Pass audit: best speed/quality
// ratio for long-context legal analysis. claude-3-5-sonnet was retired by
// Anthropic; per the official migration guide, claude-sonnet-4-6 is the
// drop-in replacement. Override via env if a future model warrants it.
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

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

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest';
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

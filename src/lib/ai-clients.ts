import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

// Vercel Pro caps function duration at 300s. We give the underlying API
// calls slightly less so the SDK throws a clean timeout error in our
// catch block — and the audit row flips to status='failed' with a
// useful error_message — rather than letting the function instance be
// killed mid-call (which leaves the row stuck at status='running').
const ANTHROPIC_TIMEOUT_MS = 240_000; // 4 min
const OPENAI_TIMEOUT_MS    =  90_000; // 1.5 min — translation pass is short

export function anthropic(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    anthropicClient = new Anthropic({ apiKey, timeout: ANTHROPIC_TIMEOUT_MS });
  }
  return anthropicClient;
}

export function openai(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
    openaiClient = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS });
  }
  return openaiClient;
}

// Sonnet 4.6 is the workhorse for the Multi-Pass audit: best speed/quality
// ratio for long-context legal analysis. claude-3-5-sonnet was retired by
// Anthropic; per the official migration guide, claude-sonnet-4-6 is the
// drop-in replacement. Override via env if a future model warrants it.
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

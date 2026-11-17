import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PROMPT, evaluate } from '../server/openrouter';
import { QUESTIONS } from '../src/app/interview.models';

describe('OpenRouter student data boundary', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env['OPENROUTER_API_KEY']; delete process.env['OPENROUTER_MODEL']; });

  it('sends only fixed questions and answers with mandatory privacy routing', async () => {
    process.env['OPENROUTER_API_KEY'] = 'synthetic-server-only-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const answers = QUESTIONS.map((question) => ({ questionId: question.id, text: question.id === 1 ? 'Synthetic answer about school' : '' }));
    await expect(evaluate(answers)).rejects.toThrow('Provider rejected 400');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const payload = JSON.parse(String(init.body));
    expect(payload.model).toBe('anthropic/claude-haiku-5.5');
    expect(payload.provider).toEqual({ require_parameters: true, zdr: true, data_collection: 'deny', allow_fallbacks: false });
    expect(payload.messages).toHaveLength(2);
    expect(JSON.parse(payload.messages[1].content)).toHaveLength(10);
    expect(payload.messages[0].content).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).toContain('Learning & Curiosity (Q3, Q9)');
    expect(SYSTEM_PROMPT).toContain('Relationships & Leadership (Q4, Q5)');
    expect(SYSTEM_PROMPT).toContain('Growth & Aspirations (Q6, Q7, Q8, Q10)');
    expect(JSON.parse(payload.messages[1].content).map((item: { categoryId: string }) => item.categoryId)).toEqual(QUESTIONS.map((q) => q.categoryId));
    expect(JSON.stringify(payload)).not.toMatch(/studentName|tutorGroup|formGroup|Synthetic Student/);
    expect(init.headers).not.toHaveProperty('X-OpenRouter-Cache');
  });

  it('fails closed before any request when the key or approved model is unavailable', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(evaluate([])).rejects.toThrow('OpenRouter unavailable');
    process.env['OPENROUTER_API_KEY'] = 'synthetic-server-only-key';
    process.env['OPENROUTER_MODEL'] = 'unapproved-model';
    await expect(evaluate([])).rejects.toThrow('Unapproved model configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

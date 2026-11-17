import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, QUESTIONS } from '../src/app/interview.models';

const hashes = [
  'cdef46b9b0e5d29c960be2403d0f39d2e317c3a3b70eaac1f3ccdcb5affbad71',
  'bee9f7b741a4b151bf09e609134db6e992746025c72bf9a6bcb7dc56f54bf3c9',
  '71bb429a36ae2b4fd47f0491a046f23b1e28d240d43f123191721f60b5678e7b',
  'dedc8e5b21d6d937d1973461cc09b9577c4f00a6c89c1894738f3ee7b93172df',
  '0de47ffdeb36456883a9af08a4e2d5427f76a853a8bbb3a137732700a1e0e12a',
  '8d6a4c50862ca2d1a54735bc0abac18a5f3227ab74709ddcc185709e3eca2a30',
  '953652518d21f35a9f5670c3f43ad224385e41a2ec355f26c756603aa3004b00',
  '1d0c076e9c6c71095ae5dcf03939c4b15607b7e533c3fa7e5d99d3bcf8827167',
  'cbe7c47defcc4250c9104fdc2f852c6cea1dd81bd6e364cc06eab4789914f203',
  '21b0e2c970b93559950ad6df23c2bc187ff3314cfa86a3e9765bcb86c39a622a',
];

describe('approved question set and audio', () => {
  it('assigns each fixed question to its approved domain', () => {
    expect(CATEGORIES.map(({ title }) => title)).toEqual([
      'Transition & Adjustment', 'Learning & Curiosity', 'Relationships & Leadership', 'Growth & Aspirations',
    ]);
    expect(QUESTIONS.map(({ categoryId }) => categoryId)).toEqual([
      'transition', 'transition', 'learning', 'relationships', 'relationships',
      'growth', 'growth', 'growth', 'learning', 'growth',
    ]);
  });
  it('keeps a tailored hint for every question', () => {
    expect(QUESTIONS.map(({ hint }) => hint)).toEqual([
      'Think of one change you have noticed in your school day.',
      'Think about one change and how it has felt for you.',
      'Think of something you enjoy learning or doing in that subject.',
      'A small moment when you helped or guided others counts.',
      'Think about listening, including others or sharing a task.',
      'Choose something that mattered to you and say why.',
      'Think of one challenge and what you tried next.',
      'Choose one skill or habit you would like to work on.',
      'Think about a skill you are curious to try and how it could help.',
      'Share one hope for the future in your own words.',
    ]);
  });
  it('locks all ten mapped MP3s, especially the unchanged first recording', () => {
    expect(QUESTIONS.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(QUESTIONS.map(({ id }) => createHash('sha256').update(readFileSync(join(process.cwd(), 'public/audio/questions', `q${String(id).padStart(2, '0')}.mp3`))).digest('hex'))).toEqual(hashes);
  });
});

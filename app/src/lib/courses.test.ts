import { describe, expect, it } from 'bun:test';
import { stripCourseCodePrefix } from './courses';

describe('stripCourseCodePrefix', () => {
  it('drops a colon-prefixed code', () => {
    expect(stripCourseCodePrefix('CLU3M: Understanding Canadian Law', 'clu3m')).toBe(
      'Understanding Canadian Law'
    );
  });

  it('drops dash separators of every kind', () => {
    expect(stripCourseCodePrefix('BAF3M - Financial Accounting Fundamentals', 'baf3m')).toBe(
      'Financial Accounting Fundamentals'
    );
    expect(stripCourseCodePrefix('BAF3M – Financial Accounting Fundamentals', 'baf3m')).toBe(
      'Financial Accounting Fundamentals'
    );
    expect(stripCourseCodePrefix('BAF3M — Financial Accounting Fundamentals', 'baf3m')).toBe(
      'Financial Accounting Fundamentals'
    );
  });

  it('matches the code case-insensitively', () => {
    expect(stripCourseCodePrefix('GWL3O: Course Study Guide', 'gwl3o')).toBe('Course Study Guide');
    expect(stripCourseCodePrefix('gwl3o: Course Study Guide', 'GWL3O')).toBe('Course Study Guide');
  });

  it('escapes regex metacharacters in the course id', () => {
    expect(stripCourseCodePrefix('CYH4U.A: Advanced Topics', 'cyh4u.a')).toBe('Advanced Topics');
  });

  it('leaves titles without the code prefix untouched', () => {
    expect(stripCourseCodePrefix('Financial Literacy Basics', 'baf3m')).toBe(
      'Financial Literacy Basics'
    );
  });

  it('falls back to the stored title when stripping leaves nothing', () => {
    expect(stripCourseCodePrefix('MCR3U', 'mcr3u')).toBe('MCR3U');
    expect(stripCourseCodePrefix('ENG4U:', 'eng4u')).toBe('ENG4U:');
  });

  it('trims surrounding whitespace', () => {
    expect(stripCourseCodePrefix('  ENG4U:   English  ', 'eng4u')).toBe('English');
    expect(stripCourseCodePrefix('  Empty  ', 'eng4u')).toBe('Empty');
  });
});

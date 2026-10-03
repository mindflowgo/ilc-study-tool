export interface QuestionOption {
  letter: string;
  text: string;
}

export interface QuizQuestion {
  number: string; // e.g. "01"
  category?: string; // e.g. "Knowledge & Understanding"
  prompt: string;
  options: QuestionOption[];
  correctAnswer: string; // e.g. "B"
  explanation?: string;
}

export interface ParsedQuiz {
  courseCode?: string;
  title: string;
  questions: QuizQuestion[];
}

export class QuestionParser {
  /**
   * Parse standardized KICA markdown into structured Quiz object
   */
  static parseMarkdown(markdown: string): ParsedQuiz {
    const lines = markdown.split('\n');
    let courseCode = '';
    let title = '';
    const questions: QuizQuestion[] = [];

    // 1. Parse header
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i].trim();
      if (line.toLowerCase().startsWith('course:')) {
        courseCode = line.replace(/course:\s*/i, '').trim();
      } else if (line.startsWith('# ')) {
        title = line.replace(/^#\s+/, '').trim();
      }
    }

    // 2. Separate into Questions section and Answers section
    const answersIndex = markdown.search(/##\s+Answers/i);
    const questionsText = answersIndex !== -1 ? markdown.substring(0, answersIndex) : markdown;
    const answersText = answersIndex !== -1 ? markdown.substring(answersIndex) : '';

    // 3. Parse Answers map
    const answerMap = new Map<string, { letter: string; explanation: string }>();
    if (answersText) {
      const answerRegex = /(\d+)\)\s*([A-Za-z])(?:\s*-\s*(?:\(explanation\))?\s*([\s\S]*?))(?=\n\d+\)|\n##|$)/g;
      let aMatch;
      while ((aMatch = answerRegex.exec(answersText)) !== null) {
        const num = aMatch[1].padStart(2, '0');
        const letter = aMatch[2].toUpperCase();
        const explanation = (aMatch[3] || '').trim();
        answerMap.set(num, { letter, explanation });
      }
    }

    // 4. Parse Questions blocks
    // Format: 01) [Category] Prompt text\n<Multiple-Choice>\n- [ ] Option A...
    const questionBlocks = questionsText.split(/--+/);

    for (const block of questionBlocks) {
      const trimmedBlock = block.trim();
      const qNumMatch = trimmedBlock.match(/(?:^|\n)(\d+)\)\s*(?:\[(.*?)\])?\s*([\s\S]*?)(?=<Multiple-Choice>|\n- \[[ xX]\]|$)/i);
      if (!qNumMatch) continue;

      const num = qNumMatch[1].padStart(2, '0');
      const category = qNumMatch[2]?.trim();
      let prompt = qNumMatch[3]?.trim() || '';
      // Remove any trailing <Multiple-Choice> tag
      prompt = prompt.replace(/<Multiple-Choice>/i, '').trim();

      // Parse options
      const options: QuestionOption[] = [];
      const optionMatches = trimmedBlock.match(/- \[[ xX]\]\s*(.*)/g);
      if (optionMatches) {
        optionMatches.forEach((optLine, idx) => {
          const optText = optLine.replace(/^- \[[ xX]\]\s*/, '').trim();
          const letter = String.fromCharCode(65 + idx); // A, B, C, D
          options.push({ letter, text: optText });
        });
      }

      const answerInfo = answerMap.get(num);

      if (options.length > 0) {
        questions.push({
          number: num,
          category,
          prompt,
          options,
          correctAnswer: answerInfo?.letter || 'A',
          explanation: answerInfo?.explanation || ''
        });
      }
    }

    return {
      courseCode,
      title: title || 'Practice Quiz',
      questions
    };
  }

  /**
   * Serialize structured Quiz object back to standardized markdown
   */
  static serializeToMarkdown(quiz: ParsedQuiz): string {
    let md = '';
    if (quiz.courseCode) {
      md += `course: ${quiz.courseCode}\n\n`;
    }
    md += `# ${quiz.title}\n\n`;
    md += `## Questions\n`;

    for (const q of quiz.questions) {
      const categoryPart = q.category ? `[${q.category}] ` : '';
      md += `${q.number}) ${categoryPart}${q.prompt}\n`;
      md += `<Multiple-Choice>\n`;
      for (const opt of q.options) {
        md += `- [ ] ${opt.text}\n`;
      }
      md += `\n--\n\n`;
    }

    md += `## Answers\n`;
    for (const q of quiz.questions) {
      const explanationPart = q.explanation ? ` - (explanation) ${q.explanation}` : '';
      md += `${q.number}) ${q.correctAnswer}${explanationPart}\n`;
    }

    return md;
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { ArchiveExtractor } from './extractor';
import { DomCleaner } from './domCleaner';
import { TurndownConverter } from './turndownConverter';
import { QuestionParser } from './questionParser';

export interface CourseManifestLesson {
  id: string; // e.g. "01.02" or "01.06_assign1"
  code: string; // e.g. "clu3m_u1la2"
  title: string;
  unitNumber: number;
  lessonNumber: number;
  type: 'lesson' | 'assignment';
  hasFull: boolean;
  hasSummary: boolean;
  hasCheatsheet: boolean;
  hasTest: boolean;
}

export interface CourseManifestUnit {
  number: number;
  title: string;
  lessons: CourseManifestLesson[];
}

export interface CourseManifest {
  id: string;
  title: string;
  grade: string;
  level: string;
  description: string;
  units: CourseManifestUnit[];
  updatedAt: string;
}

export interface IngestOptions {
  overwriteExisting?: boolean;
}

export interface IngestResult {
  manifest: CourseManifest;
  newLessonsAdded: string[];
  totalLessons: number;
}

export class CourseIngest {
  private turndownConverter: TurndownConverter;

  constructor() {
    this.turndownConverter = new TurndownConverter();
  }

  /**
   * Ingest a course directory, incrementally adding newly added zip packages
   */
  async ingestCourse(courseDir: string, options: IngestOptions = {}): Promise<CourseManifest> {
    const { overwriteExisting = false } = options;
    const courseId = path.basename(courseDir).toLowerCase();
    const backupDir = path.join(courseDir, '_backup');
    const assetsDir = path.join(courseDir, 'assets');
    const metaPath = path.join(courseDir, 'meta.json');

    fs.mkdirSync(assetsDir, { recursive: true });

    if (!fs.existsSync(backupDir)) {
      throw new Error(`Backup directory not found at: ${backupDir}`);
    }

    // Load existing manifest if present to preserve custom course titles & descriptions
    let existingManifest: Partial<CourseManifest> | null = null;
    if (fs.existsSync(metaPath)) {
      try {
        existingManifest = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (e) {
        console.warn('Could not parse existing meta.json:', e);
      }
    }

    const zipFiles = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith('.zip'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const lessonsMap: Map<string, CourseManifestLesson> = new Map();
    const newLessonsAdded: string[] = [];

    const unitTitles: Record<number, string> = {
      1: 'Heritage & Legal Foundations',
      2: 'Rights & Freedoms',
      3: 'Criminal Law & Justice System',
      4: 'Civil Law & Dispute Resolution',
      5: 'Culminating & Independent Inquiry'
    };

    // Populate existing unit titles from manifest if available
    if (existingManifest?.units) {
      for (const u of existingManifest.units) {
        if (u.title && !unitTitles[u.number]) {
          unitTitles[u.number] = u.title;
        }
      }
    }

    for (const zipFile of zipFiles) {
      const zipPath = path.join(backupDir, zipFile);
      const zipBasename = path.basename(zipFile);

      // Identify unit and lesson numbers
      const match = zipBasename.match(/u(\d+)la(\d+)(?:_assign(\d+))?/i);
      const unitNumber = match ? parseInt(match[1], 10) : 1;
      const lessonNumber = match ? parseInt(match[2], 10) : 1;
      const isAssignment = zipBasename.includes('assign') || !!(match && match[3]);

      const unitNumStr = String(unitNumber).padStart(2, '0');
      const lessonNumStr = String(lessonNumber).padStart(2, '0');
      const lessonId = isAssignment
        ? `${unitNumStr}.${lessonNumStr}_assign1`
        : `${unitNumStr}.${lessonNumStr}`;

      const lessonFilename = `${lessonId}.lesson.md`;
      const lessonFilePath = path.join(courseDir, lessonFilename);
      const isExistingLesson = fs.existsSync(lessonFilePath);

      // If lesson already exists and overwrite is false, preserve existing files and register
      if (isExistingLesson && !overwriteExisting) {
        // Read title from frontmatter or first line
        let lessonTitle = `${isAssignment ? 'Assignment' : 'Lesson'} ${unitNumber}.${lessonNumber}`;
        try {
          const content = fs.readFileSync(lessonFilePath, 'utf8');
          const titleMatch = content.match(/^title:\s*['"]?(.*?)['"]?$/m);
          if (titleMatch) lessonTitle = titleMatch[1].trim();
        } catch {}

        lessonsMap.set(lessonId, {
          id: lessonId,
          code: zipBasename.replace(/\.html\.zip$/i, '').replace(/\.zip$/i, ''),
          title: lessonTitle,
          unitNumber,
          lessonNumber,
          type: isAssignment ? 'assignment' : 'lesson',
          hasFull: fs.existsSync(path.join(courseDir, `${lessonId}.lesson.md`)),
          hasSummary: fs.existsSync(path.join(courseDir, `${lessonId}.summary.md`)),
          hasCheatsheet: fs.existsSync(path.join(courseDir, `${lessonId}.cheatsheet.md`)),
          hasTest: fs.existsSync(path.join(courseDir, `${lessonId}.test.md`))
        });
        continue;
      }

      // New lesson or overwrite requested: extract and parse
      const extracted = ArchiveExtractor.extractZip(zipPath, assetsDir);
      if (!extracted) continue;

      const cleaned = DomCleaner.clean(extracted.htmlContent);
      const unitTitle = unitTitles[extracted.unitNumber] || `Unit ${extracted.unitNumber}`;

      // 1. Write Full Lesson Markdown
      const fullLessonMd = this.turndownConverter.convertToMarkdown(cleaned.cleanedHtml, {
        title: extracted.title,
        activityCode: extracted.activityCode,
        courseId,
        unit: unitTitle,
        unitNumber: extracted.unitNumber,
        lessonNumber: extracted.lessonNumber,
        type: extracted.isAssignment ? 'assignment' : 'lesson',
        savedAt: new Date().toISOString().split('T')[0]
      });

      fs.writeFileSync(lessonFilePath, fullLessonMd, 'utf8');

      // 2. Generate Initial Summary if not exists
      const summaryFilename = `${lessonId}.summary.md`;
      const summaryFilePath = path.join(courseDir, summaryFilename);
      if (!fs.existsSync(summaryFilePath) || overwriteExisting) {
        const summaryMd = this.generateInitialSummary(
          courseId,
          extracted.unitNumber,
          extracted.lessonNumber,
          extracted.title,
          cleaned.learningGoals,
          cleaned.successCriteria,
          extracted.isAssignment
        );
        fs.writeFileSync(summaryFilePath, summaryMd, 'utf8');
      }

      // 3. Generate Initial Cheatsheet if not exists
      const cheatsheetFilename = `${lessonId}.cheatsheet.md`;
      const cheatsheetFilePath = path.join(courseDir, cheatsheetFilename);
      if (!fs.existsSync(cheatsheetFilePath) || overwriteExisting) {
        const cheatsheetMd = this.generateInitialCheatsheet(
          courseId,
          extracted.unitNumber,
          extracted.lessonNumber,
          extracted.title,
          extracted.isAssignment
        );
        fs.writeFileSync(cheatsheetFilePath, cheatsheetMd, 'utf8');
      }

      // 4. Generate Initial KICA Test if not exists
      const testFilename = `${lessonId}.test.md`;
      const testFilePath = path.join(courseDir, testFilename);
      if (!fs.existsSync(testFilePath) || overwriteExisting) {
        const testMd = this.generateInitialTest(
          courseId,
          extracted.unitNumber,
          extracted.lessonNumber,
          extracted.title,
          extracted.isAssignment
        );
        fs.writeFileSync(testFilePath, testMd, 'utf8');
      }

      lessonsMap.set(lessonId, {
        id: lessonId,
        code: extracted.activityCode,
        title: extracted.title,
        unitNumber: extracted.unitNumber,
        lessonNumber: extracted.lessonNumber,
        type: extracted.isAssignment ? 'assignment' : 'lesson',
        hasFull: true,
        hasSummary: true,
        hasCheatsheet: true,
        hasTest: true
      });

      newLessonsAdded.push(lessonId);
    }

    // Group lessons by units
    const unitsMap: Map<number, CourseManifestLesson[]> = new Map();
    for (const lesson of lessonsMap.values()) {
      if (!unitsMap.has(lesson.unitNumber)) {
        unitsMap.set(lesson.unitNumber, []);
      }
      unitsMap.get(lesson.unitNumber)!.push(lesson);
    }

    const units: CourseManifestUnit[] = Array.from(unitsMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([num, lessons]) => ({
        number: num,
        title: unitTitles[num] || `Unit ${num}`,
        lessons: lessons.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
      }));

    const defaultTitle =
      courseId.toUpperCase() === 'CLU3M'
        ? 'CLU3M: Understanding Canadian Law'
        : `${courseId.toUpperCase()}: Course Study Guide`;

    const manifest: CourseManifest = {
      id: courseId,
      title: existingManifest?.title || defaultTitle,
      grade: existingManifest?.grade || 'Grade 11',
      level: existingManifest?.level || 'University/College Preparation',
      description:
        existingManifest?.description ||
        'Comprehensive ILC course study notes, summaries, cheatsheets, and interactive practice questions.',
      units,
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(metaPath, JSON.stringify(manifest, null, 2), 'utf8');

    if (newLessonsAdded.length > 0) {
      console.log(`✨ Added ${newLessonsAdded.length} new lesson(s) to [${courseId}]:`, newLessonsAdded);
    }

    return manifest;
  }

  private generateInitialSummary(
    courseId: string,
    unit: number,
    lesson: number,
    title: string,
    goals: string[],
    criteria: string[],
    isAssignment: boolean
  ): string {
    const goalsList = goals.length > 0 ? goals.map((g) => `- ${g}`).join('\n') : '- Synthesize core concepts and curricular expectations.';
    const criteriaList = criteria.length > 0 ? criteria.map((c) => `- ${c}`).join('\n') : '- Demonstrate understanding through curriculum-aligned applications.';

    return `# Study Summary: ${title}

## Executive Overview
This learning activity investigates key concepts under **${courseId.toUpperCase()} Unit ${unit}**. It equips students with the conceptual tools needed to analyze legal structures, evaluate historical developments, and apply constitutional and statutory frameworks in Canada.

## Key Learning Goals
${goalsList}

## Success Criteria
${criteriaList}

## Core Concepts & Legal Frameworks
- **Legal Significance**: Assessing how key decisions, historical events, and statutes shape civic rights and judicial doctrines.
- **Rule of Law**: The foundational principle that all persons and institutions are accountable to publicly promulgated, equally enforced laws.
- **Adjudication & Procedure**: How formal legal mechanisms resolve disputes and protect societal order while balancing individual freedoms.

## Exam & Evaluation Focus
- Distinguishing between primary and secondary sources of law.
- Analyzing case studies with legal tests and evidentiary standards.
- Formulating structured arguments using legal terminology and precedents.
`;
  }

  private generateInitialCheatsheet(
    courseId: string,
    unit: number,
    lesson: number,
    title: string,
    isAssignment: boolean
  ): string {
    return `# High-Yield Cheatsheet: ${title}

## Terminology Quick Reference
| Legal Term | Definition | Context / Scope |
| :--- | :--- | :--- |
| **Rule of Law** | Principle that no one is above the law and all are subject to the same judicial processes. | Constitutional principle |
| **Substantive Law** | Laws that define rights, duties, and obligations of citizens. | Criminal Code, Civil Code |
| **Procedural Law** | Prescribes methods of enforcing legal rights and court processes. | Court rules, police procedures |
| **Precedent (Stare Decisis)** | Principle requiring courts to follow decisions made by superior courts. | Common Law doctrine |

## Critical Distinctions
- **Rules vs. Laws**: Rules are established by private institutions (schools, clubs) and apply only to participants. Laws are enacted by governments, apply universally, and carry state enforcement.
- **Public vs. Private Law**: Public law governs citizen-state interactions (Constitutional, Criminal, Administrative); Private (Civil) law governs citizen-to-citizen disputes (Tort, Contract, Family, Property).

## High-Yield Memory Anchors
- ⚖️ *Roncarelli v. Duplessis (1959)*: Affirmed that government officials cannot act arbitrarily; no public official is above the law.
- 📜 *Parliamentary Supremacy*: Within constitutional boundaries, elected legislative bodies hold ultimate power to make and repeal statutes.
`;
  }

  private generateInitialTest(
    courseId: string,
    unit: number,
    lesson: number,
    title: string,
    isAssignment: boolean
  ): string {
    const courseCode = `${courseId.toUpperCase()}.${String(unit).padStart(2, '0')}.${String(lesson).padStart(2, '0')}`;

    return `course: ${courseCode}

# ${title} - Practice Test

## Questions
01) [Knowledge & Understanding] What is the essential difference between a rule and a law in Canadian jurisprudence?
<Multiple-Choice>
- [ ] Rules are enforced by the courts; laws are enforced by non-governmental arbiters.
- [ ] Laws apply to all members of society and are enforced by the state; rules apply only to members of specific organizations.
- [ ] Rules carry mandatory minimum custodial sentences while laws carry only financial penalties.
- [ ] Rules apply exclusively to criminal proceedings; laws apply exclusively to contract disputes.

--

02) [Thinking & Investigation] Which historical doctrine dictates that courts must adhere to principles established in prior superior court decisions?
<Multiple-Choice>
- [ ] Habeas Corpus
- [ ] Stare Decisis (Rule of Precedent)
- [ ] Ultra Vires
- [ ] Mens Rea

--

03) [Communication] In an Ontario legal analysis paragraph, what is the role of an explicit 'legal significance' rationale?
<Multiple-Choice>
- [ ] To state the verbatim statutory citation without analytical commentary.
- [ ] To demonstrate how a particular court decision, principle, or event directly reshaped citizen rights or legal institutions.
- [ ] To summarize the personal background of the presiding judge.
- [ ] To list the chronological order of court filing dates.

--

04) [Application] A municipality passes a bylaw prohibiting skateboard riding on public sidewalks to prevent pedestrian collisions. Which statement accurately categorizes this legal measure?
<Multiple-Choice>
- [ ] It is an unofficial rule because it was not enacted by the federal Parliament in Ottawa.
- [ ] It is a valid law authorized under provincial municipal legislation, enforceable with legal penalties.
- [ ] It is private contract law binding only on individuals who registered with city hall.
- [ ] It is an unconstitutional violation that automatically invalidates all provincial traffic acts.

--

## Answers
01) B - (explanation) Laws are enacted by governing authorities, apply universally across a jurisdiction, and are enforced by state organs (police and courts). Rules apply only within voluntary groups or specific venues.
02) B - (explanation) The doctrine of stare decisis (to stand by things decided) forms the bedrock of the English and Canadian common law systems, promoting predictability and fairness.
03) B - (explanation) Legal significance in the Ontario curriculum evaluates the magnitude of impact an event, precedent, or statute has on the rights of citizens or legal structures.
04) B - (explanation) Municipal bylaws are delegated legislation authorized by provincial statutes; they possess the full force of law within the municipal jurisdiction.
`;
  }
}

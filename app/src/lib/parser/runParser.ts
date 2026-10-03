import path from 'node:path';
import fs from 'node:fs';
import { CourseIngest } from './courseIngest';

async function main() {
  console.log('🚀 Starting ILC Course Parser Engine...');

  // Look for data/courses directory
  const rootDir = process.cwd().endsWith('/app') ? path.resolve(process.cwd(), '..') : process.cwd();
  const coursesDir = path.join(rootDir, 'data', 'courses');

  if (!fs.existsSync(coursesDir)) {
    console.error(`❌ Courses directory not found at: ${coursesDir}`);
    process.exit(1);
  }

  const courseFolders = fs
    .readdirSync(coursesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name);

  console.log(`📦 Found courses: ${courseFolders.join(', ')}`);

  const ingester = new CourseIngest();

  for (const courseId of courseFolders) {
    const coursePath = path.join(coursesDir, courseId);
    console.log(`\n⏳ Ingesting course [${courseId}]...`);
    try {
      const manifest = await ingester.ingestCourse(coursePath);
      console.log(`✅ Ingested [${courseId}]: "${manifest.title}"`);
      console.log(`   Units: ${manifest.units.length}`);
      const totalLessons = manifest.units.reduce((acc, u) => acc + u.lessons.length, 0);
      console.log(`   Lessons & Assignments: ${totalLessons}`);
    } catch (err) {
      console.error(`❌ Failed to ingest [${courseId}]:`, err);
    }
  }

  console.log('\n🎉 Course parsing complete!');
}

main().catch((err) => {
  console.error('Fatal parser error:', err);
  process.exit(1);
});

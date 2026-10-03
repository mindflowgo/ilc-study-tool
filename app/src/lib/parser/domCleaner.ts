import * as cheerio from 'cheerio';

export interface CleanedDomResult {
  title: string;
  cleanedHtml: string;
  learningGoals: string[];
  successCriteria: string[];
}

export class DomCleaner {
  static clean(html: string): CleanedDomResult {
    const $ = cheerio.load(html);

    // 1. Extract Title
    const pageTitle = $('title').text().trim().replace(/\s+/g, ' ');
    const h1Title = $('h1').first().text().trim();
    const title = pageTitle || h1Title || 'ILC Lesson';

    // 2. Extract Learning Goals & Success Criteria
    const learningGoals: string[] = [];
    const successCriteria: string[] = [];

    $('#ilcLearningGoals').each((_, el) => {
      const container = $(el);
      let isSuccessCriteria = false;

      container.children().each((__, child) => {
        const text = $(child).text().trim().toLowerCase();
        if (text.includes('success criteria')) {
          isSuccessCriteria = true;
        } else if ($(child).is('ul, ol')) {
          $(child).find('li').each((___, li) => {
            const item = $(li).text().trim();
            if (item) {
              if (isSuccessCriteria) {
                successCriteria.push(item);
              } else {
                learningGoals.push(item);
              }
            }
          });
        }
      });
    });

    // Replace #ilcLearningGoals with a formatted callout element in DOM
    if (learningGoals.length > 0 || successCriteria.length > 0) {
      let goalsHtml = `<div class="ilc-callout-goals"><h3>Learning Goals & Success Criteria</h3>`;
      if (learningGoals.length > 0) {
        goalsHtml += `<p><strong>You are learning to:</strong></p><ul>`;
        learningGoals.forEach((g) => (goalsHtml += `<li>${g}</li>`));
        goalsHtml += `</ul>`;
      }
      if (successCriteria.length > 0) {
        goalsHtml += `<p><strong>Success criteria:</strong></p><ul>`;
        successCriteria.forEach((s) => (goalsHtml += `<li>${s}</li>`));
        goalsHtml += `</ul>`;
      }
      goalsHtml += `</div>`;
      $('#ilcLearningGoals').replaceWith(goalsHtml);
    } else {
      $('#ilcLearningGoals').remove();
    }

    // 3. Process Section Banners (#mindsOn, #action, #consolidation)
    $('#mindsOn .banner').replaceWith('<h2>Minds On</h2>');
    $('#action .banner').replaceWith('<h2>Action</h2>');
    $('#consolidation .banner').replaceWith('<h2>Consolidation</h2>');

    // 4. Convert Answer Reveal Buttons into HTML <details><summary>
    $('.btn-answer-reveal').each((_, btn) => {
      const button = $(btn);
      const targetId = button.attr('id')?.replace('Button', '') || '';
      let answerDiv: any = button.next('.answer_reveal');
      if (!answerDiv.length && targetId) {
        answerDiv = $(`#${targetId}`);
      }

      const summaryText = button.text().trim() || 'Suggested Answer';
      const answerContent = answerDiv.length ? answerDiv.html() || '' : '';

      const detailsHtml = `\n<details class="suggested-answer"><summary>${summaryText}</summary>\n<div>${answerContent}</div>\n</details>\n`;
      button.replaceWith(detailsHtml);
      answerDiv.remove();
    });

    // 5. Rewrite Asset and Document Links
    $('img').each((_, img) => {
      const src = $(img).attr('src') || '';
      if (src.includes('assets/img/')) {
        const filename = src.split('assets/img/').pop();
        $(img).attr('src', `./assets/img/${filename}`);
      } else if (src.includes('assets/icons/')) {
        const filename = src.split('assets/icons/').pop();
        $(img).attr('src', `./assets/icons/${filename}`);
      }
    });

    $('a').each((_, link) => {
      const href = $(link).attr('href') || '';
      if (href.includes('assets/locker_docs/')) {
        const filename = href.split('assets/locker_docs/').pop();
        $(link).attr('href', `./assets/locker_docs/${filename}`);
      }
    });

    // 6. Remove scripts, styles, noscript, and D2L navigation chrome
    $('script, style, noscript, link[rel="stylesheet"]').remove();
    $('.sr-only, .hidden').remove();

    // 7. Get main content
    const mainEl = $('main#mainContent, #mainContent, body').first();
    const cleanedHtml = mainEl.length ? mainEl.html() || '' : $('body').html() || '';

    return {
      title,
      cleanedHtml,
      learningGoals,
      successCriteria
    };
  }
}

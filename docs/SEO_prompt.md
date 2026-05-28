## When writing content on the website

You are an expert SEO content writer. Write a fully optimized webpage for the page described below. Follow every instruction precisely.

### PAGE DETAILS
- Business name: [BUSINESS NAME]
- Page topic / primary service: [TOPIC]
- Target primary keyword: [PRIMARY KEYWORD]
- Secondary/related keywords: [3-6 RELATED KEYWORDS]
- Target location(s): [CITY, STATE — or "national"]
- Target audience: [WHO THIS PAGE IS FOR]
- Page goal / desired action: [E.G., book a call, request a quote]
- Approximate word count: [E.G., 900-1,200 words]

### CONTENT REQUIREMENTS
1. **Search intent**: Open by directly answering what the reader came to find. Lead with the answer, then expand. Do not bury the main point.
2. **Structure**: Use a clear H1, then logical H2/H3 subheadings. Make subheadings descriptive and keyword-relevant, not vague.
3. **Keyword use**: Include the primary keyword in the H1, the first 100 words, at least one H2, and naturally throughout. Do not keyword-stuff — write for humans first. Include secondary keywords where they fit naturally.
4. **Topical depth**: Cover the subtopics a knowledgeable reader would expect. Address the practical questions, not just surface-level description.
5. **Tone & readability**: Short paragraphs (2-4 sentences). Plain language. Specific and concrete over generic marketing fluff.
6. **E-E-A-T signals**: Where relevant, include concrete specifics (process steps, what's included, how it works, what makes the business qualified). Do not invent credentials, statistics, awards, or claims you cannot verify — if a specific fact is needed, insert a clearly marked placeholder like `[INSERT VERIFIED STAT]` for me to fill in.
7. **Contextual internal links**: Identify 3-6 places where it would make sense to link to other pages on this site. For each, give: (a) the recommended anchor text, and (b) what kind of page it should point to. Place these inline as `[LINK: anchor text → target page type]`. Use descriptive anchor text, never "click here."
8. **CTA**: End the main body with a clear call to action aligned with the page goal.

### FAQ SECTION
- Add an "FAQ" section with 5-8 questions real users would ask about this topic.
- Phrase questions the way people actually search/speak (natural language, often question form).
- Answers should be concise (40-80 words), self-contained, and directly answer the question in the first sentence — this is what LLMs and featured snippets extract.
- Base FAQs on genuine user concerns for this topic. Do not fabricate specifics.

### FAQ SCHEMA
- After the content, output valid FAQPage JSON-LD schema (schema.org spec) containing every FAQ Q&A, ready to paste into the page `<head>` or via tag manager.
- The schema text must match the on-page FAQ text exactly (Google requires this).

### OUTPUT FORMAT
1. The full page content with headings and inline link markers.
2. A separate list of recommended internal links.
3. The FAQPage JSON-LD schema in a code block.

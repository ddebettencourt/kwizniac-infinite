import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export async function generateClues(topic) {
  const prompt = `You are creating clues for a Quiz Bowl-style trivia game called Kwizniac. The answer is: "${topic}"

Generate exactly 10 clues, numbered from 10 to 1.

CRITICAL: Clue difficulty = how DIRECTLY the clue points to the answer's defining characteristics.

STRICT RULES - VIOLATIONS WILL RUIN THE GAME:
1. NEVER include the answer word, or any part/variation of it, in ANY clue
   - For "Claude": cannot say "Claudius", "Claude", "Claudian", etc.
   - For "Einstein": cannot say "Einstein", "Einsteinian", etc.
2. NEVER use etymology or name origins - these almost always give it away
3. NEVER start clues with "This person/place/thing..." - don't reveal the category
4. Early clues should be so indirect that hearing them alone wouldn't help at all

OBSCURE clues (10-8) - Facts that DON'T reveal the category or field:
  - Connections to unexpected people, places, or things
  - Numerical facts, dates, measurements without context
  - Lesser-known collaborators, investors, or partners
  - Random biographical details (for people: hobbies, pets, residences)
  - Technical specifications that could apply to many things

MEDIUM clues (7-4) - Hints at the category without being specific:
  - General field or era without specifics
  - Comparisons to similar things
  - Awards or recognition without naming the work

EASY clues (3-1) - The defining characteristics:
  - What they're famous for
  - Iconic traits everyone knows

EXAMPLES:
"Mr Beast" BAD: "Made a viral video counting to 100,000" → reveals YouTuber + stunts
"Mr Beast" GOOD: "Co-founded Night Media talent management company"

"Claude" (the AI) BAD: "Its name derives from Claudius..." → contains the answer!
"Claude" (the AI) GOOD: "Was trained using a technique called Constitutional AI"

"Eiffel Tower" BAD: "An iron lattice tower in Paris" → dead giveaway
"Eiffel Tower" GOOD: "Was originally intended to stand for only 20 years"

OTHER RULES:
- Each clue must be a single sentence
- Be factually accurate
- No repetition between clues
- If the answer is ambiguous, pick the most famous interpretation

Rate how well-known the ANSWER is (0-10):
0: Universal (The Sun, Albert Einstein, Pizza)
2: Very famous (Taylor Swift, Eiffel Tower, World War II)
4: Well-known (Marie Curie, The Great Gatsby, NASA)
6: Moderate (Ada Lovelace, Machu Picchu, The Odyssey)
8: Somewhat obscure (Rosalind Franklin, Angkor Wat, Dostoevsky)
10: Very obscure (Hedy Lamarr, Göbekli Tepe, Emmy Noether)

Output JSON only:
{"answerDifficulty": 3, "clues": [{"number": 10, "text": "..."}, {"number": 9, "text": "..."}, ...]}`;

  try {
    console.log('Calling Claude API with web search...');
    const startTime = Date.now();

    let response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: prompt }]
    });

    // Handle pause_turn - continue the conversation if Claude paused
    let messages = [{ role: 'user', content: prompt }];
    while (response.stop_reason === 'pause_turn') {
      console.log('Claude paused, continuing...');
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: 'Please continue.' });
      response = await anthropic.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 4096,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        messages
      });
    }

    console.log(`Claude API responded in ${Date.now() - startTime}ms`);
    console.log('Response stop_reason:', response.stop_reason);
    console.log('Response content types:', response.content.map(b => b.type));

    // Collect all text blocks and concatenate them
    const textBlocks = response.content.filter(block => block.type === 'text');
    if (textBlocks.length === 0) {
      console.error('No text blocks found. Full response:', JSON.stringify(response.content, null, 2));
      throw new Error('No text response from Claude');
    }

    const content = textBlocks.map(b => b.text).join('');
    console.log('Combined text response length:', content.length);

    // Parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        clues: parsed.clues,
        answerDifficulty: parsed.answerDifficulty ?? 5
      };
    }
    console.error('Failed to parse JSON from:', content.substring(0, 500));
    throw new Error('Failed to parse clues from response');
  } catch (error) {
    console.error('Error generating clues:', error.message);
    if (error.response) {
      console.error('API error details:', error.response.data);
    }
    throw error;
  }
}

export async function gradeAnswer(correctAnswer, playerAnswer) {
  const prompt = `You are grading an answer in a trivia game.

Correct Answer: "${correctAnswer}"
Player's Answer: "${playerAnswer}"

Is the player's answer correct? Consider:
- Minor spelling mistakes should be accepted
- Common nicknames or abbreviations should be accepted (e.g., "JFK" for "John F. Kennedy")
- The answer must refer to the same thing, not just be partially related
- Be lenient with capitalization and punctuation

Respond with ONLY "CORRECT" or "INCORRECT" - nothing else.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }]
    });

    const result = response.content[0].text.trim().toUpperCase();
    return result === 'CORRECT';
  } catch (error) {
    console.error('Error grading answer:', error);
    // On error, do a simple string comparison
    return correctAnswer.toLowerCase().trim() === playerAnswer.toLowerCase().trim();
  }
}

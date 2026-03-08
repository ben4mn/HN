// extractive.js - Client-side extractive summarizer using TextRank + lead bias + MMR

const ExtractiveSummarizer = {
  // Strip Jina Reader metadata preamble before processing
  _stripJinaPreamble(text) {
    // Jina prepends "Title: ...\nURL Source: ...\nMarkdown Content:\n..."
    const marker = 'Markdown Content:';
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      text = text.slice(idx + marker.length);
    } else {
      // Sometimes just "Title: ...\nURL Source: ...\n" without Markdown Content
      text = text.replace(/^Title:.*$/m, '').replace(/^URL Source:.*$/m, '');
    }
    return text;
  },

  // Clean raw extracted text before processing
  _cleanText(text) {
    return this._stripJinaPreamble(text)
      // Remove standalone URLs
      .replace(/https?:\/\/\S+/g, '')
      // Convert markdown links [text](url) to just text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove markdown image syntax ![alt](url)
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      // Remove markdown headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove markdown bold/italic markers
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      // Remove separator lines (=== or ---)
      .replace(/^[-=]{3,}\s*$/gm, '')
      // Remove lines that look like nav menus (many * bullets with links)
      .replace(/^\s*\*\s+\[.*$/gm, '')
      // Remove lines that are mostly special chars (nav, separators)
      .replace(/^[^a-zA-Z]*$/gm, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();
  },

  // Common site chrome / boilerplate phrases to detect
  _NAV_PHRASES: /skip to content|toggle navigation|navigation menu|sign in|sign up|log in|cookie policy|privacy policy|terms of service|all rights reserved|subscribe to|newsletter/i,

  // Check if a sentence is junk (links, nav items, boilerplate)
  _isJunkSentence(sent) {
    // Still contains URLs after cleaning
    if (/https?:\/\//.test(sent)) return true;
    // Known site chrome phrases
    if (this._NAV_PHRASES.test(sent)) return true;
    // ALL CAPS phrases (nav headers like "DEVELOPER WORKFLOWS", "APPLICATION SECURITY")
    const words = sent.split(/\s+/);
    const allCaps = words.filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
    if (allCaps.length >= 2 && allCaps.length / words.length > 0.4) return true;
    // More than 30% of words are capitalized single words (nav menus)
    const capSingle = words.filter(w => w.length < 15 && /^[A-Z][a-z]*$/.test(w));
    if (words.length > 2 && capSingle.length / words.length > 0.5) return true;
    // Too many pipe/bullet separators (nav bars)
    if ((sent.match(/[|>*]/g) || []).length >= 3) return true;
    // Mostly numbers or very short tokens (table data)
    const alphaWords = words.filter(w => /[a-zA-Z]{2,}/.test(w));
    if (alphaWords.length < words.length * 0.4) return true;
    return false;
  },

  // Common abbreviations that shouldn't trigger sentence splits
  _ABBREVS: /(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Ave|Blvd|Gen|Gov|Sgt|Cpl|Pvt|Rev|Hon|Pres|Vol|Dept|Est|Fig|Inc|Corp|Ltd|Co|vs|etc|approx|i\.e|e\.g|U\.S|U\.K|U\.N)\./gi,

  // Split text into sentences, handling common abbreviations
  _splitSentences(text) {
    const clean = this._cleanText(text);
    // Protect abbreviations by replacing their dots with a placeholder
    const placeholder = '\u0000';
    const protected_ = clean.replace(this._ABBREVS, match => match.replace(/\./g, placeholder));
    // Split on sentence-ending punctuation followed by space + uppercase or end
    const raw = protected_.match(/[^.!?]*[.!?]+[\s]|[^.!?]*[.!?]+$/g);
    if (!raw) return [clean];
    return raw
      .map(s => s.replace(new RegExp(placeholder, 'g'), '.').trim())
      .filter(s => s.length > 25 && s.split(/\s+/).length >= 5 && !this._isJunkSentence(s));
  },

  // Tokenize into lowercase words, strip punctuation
  _tokenize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  },

  // Common English stop words to ignore
  _STOP_WORDS: new Set([
    'the','be','to','of','and','a','in','that','have','i','it','for','not','on',
    'with','he','as','you','do','at','this','but','his','by','from','they','we',
    'say','her','she','or','an','will','my','one','all','would','there','their',
    'what','so','up','out','if','about','who','get','which','go','me','when',
    'make','can','like','time','no','just','him','know','take','people','into',
    'year','your','good','some','could','them','see','other','than','then','now',
    'look','only','come','its','over','think','also','back','after','use','two',
    'how','our','work','first','well','way','even','new','want','because','any',
    'these','give','day','most','us','is','are','was','were','been','has','had',
    'did','does','done','being','am','more','very','much','own','such','may',
    'should','shall','must','need','said','each','tell','set','still','might',
    'while','found','made','between','many','before','long','great','those'
  ]),

  // Get filtered tokens (no stop words, min length 3)
  _contentTokens(tokens) {
    return tokens.filter(t => !this._STOP_WORDS.has(t) && t.length > 2);
  },

  // Build a TF vector for a sentence (term -> normalized frequency)
  _tfVector(tokens) {
    const tf = {};
    const filtered = this._contentTokens(tokens);
    filtered.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
    const max = Math.max(...Object.values(tf), 1);
    Object.keys(tf).forEach(t => { tf[t] /= max; });
    return tf;
  },

  // Cosine similarity between two TF vectors
  _cosineSim(vecA, vecB) {
    const terms = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
    let dot = 0, magA = 0, magB = 0;
    terms.forEach(t => {
      const a = vecA[t] || 0;
      const b = vecB[t] || 0;
      dot += a * b;
      magA += a * a;
      magB += b * b;
    });
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom > 0 ? dot / denom : 0;
  },

  // Run TextRank: iterative PageRank-style scoring on sentence similarity graph
  _textRank(tfVectors, damping = 0.85, iterations = 20, convergence = 0.0001) {
    const n = tfVectors.length;
    if (n === 0) return [];

    // Build similarity matrix (symmetric)
    const sim = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const s = this._cosineSim(tfVectors[i], tfVectors[j]);
        sim[i][j] = s;
        sim[j][i] = s;
      }
    }

    // Row sums for normalization
    const rowSum = sim.map(row => row.reduce((a, b) => a + b, 0));

    // Initialize scores uniformly
    let scores = new Float64Array(n).fill(1 / n);

    for (let iter = 0; iter < iterations; iter++) {
      const newScores = new Float64Array(n);
      let maxDelta = 0;

      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          if (rowSum[j] > 0) {
            sum += (sim[j][i] / rowSum[j]) * scores[j];
          }
        }
        newScores[i] = (1 - damping) / n + damping * sum;
        maxDelta = Math.max(maxDelta, Math.abs(newScores[i] - scores[i]));
      }

      scores = newScores;
      if (maxDelta < convergence) break;
    }

    return Array.from(scores);
  },

  // MMR selection: pick sentences that are relevant but not redundant
  _mmrSelect(candidates, tfVectors, count, lambda = 0.6) {
    const selected = [];
    const remaining = new Set(candidates.map((_, i) => i));

    while (selected.length < count && remaining.size > 0) {
      let bestIdx = -1;
      let bestScore = -Infinity;

      remaining.forEach(i => {
        const relevance = candidates[i].score;

        // Max similarity to any already-selected sentence
        let maxSim = 0;
        selected.forEach(j => {
          const s = this._cosineSim(
            tfVectors[candidates[i].idx],
            tfVectors[candidates[j].idx]
          );
          maxSim = Math.max(maxSim, s);
        });

        const mmr = lambda * relevance - (1 - lambda) * maxSim;
        if (mmr > bestScore) {
          bestScore = mmr;
          bestIdx = i;
        }
      });

      if (bestIdx === -1) break;
      selected.push(bestIdx);
      remaining.delete(bestIdx);
    }

    return selected.map(i => candidates[i]);
  },

  /**
   * Generate extractive summary from text.
   * @param {string} text - Article body text
   * @param {string} title - Article title
   * @returns {{short: string, long: string}}
   */
  summarize(text, title) {
    const sentences = this._splitSentences(text);

    if (sentences.length === 0) {
      return { short: title, long: title };
    }
    if (sentences.length <= 2) {
      return { short: sentences[0], long: sentences.join(' ') };
    }

    // Tokenize all sentences and build TF vectors
    const sentenceTokens = sentences.map(s => this._tokenize(s));
    const tfVectors = sentenceTokens.map(t => this._tfVector(t));
    const titleTokens = this._contentTokens(
      this._tokenize(title || '')
    );

    // TextRank scores
    const trScores = this._textRank(tfVectors);

    // Normalize TextRank scores to [0, 1]
    const maxTR = Math.max(...trScores, 0.001);
    const normTR = trScores.map(s => s / maxTR);

    // Score each sentence with TextRank + lead bias + title overlap
    const scored = sentences.map((sent, i) => {
      // Base: TextRank score
      let score = normTR[i];

      // Lead-paragraph bias: strong boost for first ~20% of sentences
      const relPos = i / Math.max(sentences.length - 1, 1);
      if (relPos < 0.2) {
        // First 2-3 sentences get heaviest boost, diminishing through 20%
        const leadBoost = 0.4 * (1 - relPos / 0.2);
        score += leadBoost;
      }

      // Title overlap: fraction of title keywords in sentence
      if (titleTokens.length > 0) {
        const sentContent = new Set(this._contentTokens(sentenceTokens[i]));
        const overlap = titleTokens.filter(t => sentContent.has(t)).length;
        score += 0.25 * (overlap / titleTokens.length);
      }

      return { sent, score, idx: i };
    });

    // Sort by score descending for MMR selection
    scored.sort((a, b) => b.score - a.score);

    // Use MMR to select diverse, high-scoring sentences
    const shortPicks = this._mmrSelect(scored, tfVectors, 2)
      .sort((a, b) => a.idx - b.idx);
    const longPicks = this._mmrSelect(scored, tfVectors, 4)
      .sort((a, b) => a.idx - b.idx);

    return {
      short: shortPicks.map(s => s.sent).join(' '),
      long: longPicks.map(s => s.sent).join(' ')
    };
  }
};

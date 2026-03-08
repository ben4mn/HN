// extractive.js - Client-side extractive summarizer using TF-IDF sentence scoring

const ExtractiveSummarizer = {
  // Clean raw extracted text before processing
  _cleanText(text) {
    return text
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
      // Remove lines that are mostly special chars (nav, separators)
      .replace(/^[^a-zA-Z]*$/gm, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();
  },

  // Check if a sentence is junk (links, nav items, boilerplate)
  _isJunkSentence(sent) {
    // Still contains URLs after cleaning
    if (/https?:\/\//.test(sent)) return true;
    // More than 30% of words are capitalized single words (nav menus)
    const words = sent.split(/\s+/);
    const capSingle = words.filter(w => w.length < 15 && /^[A-Z][a-z]*$/.test(w));
    if (words.length > 2 && capSingle.length / words.length > 0.5) return true;
    // Too many pipe/bullet separators (nav bars)
    if ((sent.match(/[|>]/g) || []).length >= 3) return true;
    // Mostly numbers or very short tokens (table data)
    const alphaWords = words.filter(w => /[a-zA-Z]{2,}/.test(w));
    if (alphaWords.length < words.length * 0.4) return true;
    return false;
  },

  // Split text into sentences, handling common abbreviations
  _splitSentences(text) {
    const clean = this._cleanText(text);
    // Split on sentence-ending punctuation followed by space + uppercase or end
    const raw = clean.match(/[^.!?]*[.!?]+[\s]|[^.!?]*[.!?]+$/g);
    if (!raw) return [clean];
    return raw
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.split(/\s+/).length >= 4 && !this._isJunkSentence(s));
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

  // Compute term frequencies for a list of tokens (excluding stop words)
  _termFrequency(tokens) {
    const tf = {};
    const filtered = tokens.filter(t => !this._STOP_WORDS.has(t) && t.length > 2);
    filtered.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
    const max = Math.max(...Object.values(tf), 1);
    Object.keys(tf).forEach(t => { tf[t] /= max; });
    return tf;
  },

  // Compute IDF from an array of sentence token arrays
  _inverseDocFrequency(sentenceTokens) {
    const n = sentenceTokens.length;
    const df = {};
    sentenceTokens.forEach(tokens => {
      const unique = new Set(tokens.filter(t => !this._STOP_WORDS.has(t)));
      unique.forEach(t => { df[t] = (df[t] || 0) + 1; });
    });
    const idf = {};
    Object.keys(df).forEach(t => {
      idf[t] = Math.log((n + 1) / (df[t] + 1)) + 1;
    });
    return idf;
  },

  // Score a single sentence
  _scoreSentence(tokens, tf, idf, position, totalSentences, titleTokens) {
    // TF-IDF score
    let tfidf = 0;
    const filtered = tokens.filter(t => !this._STOP_WORDS.has(t) && t.length > 2);
    filtered.forEach(t => {
      tfidf += (tf[t] || 0) * (idf[t] || 0);
    });
    // Normalize by sentence length to avoid favoring long sentences
    const norm = Math.max(filtered.length, 1);
    tfidf /= norm;

    // Position bias: boost first and last ~15% of sentences
    let posBoost = 0;
    const relPos = position / Math.max(totalSentences - 1, 1);
    if (relPos < 0.15) posBoost = 0.3 * (1 - relPos / 0.15);
    else if (relPos > 0.85) posBoost = 0.1 * ((relPos - 0.85) / 0.15);

    // Title overlap: fraction of title keywords present in sentence
    let titleBoost = 0;
    if (titleTokens.length > 0) {
      const sentSet = new Set(filtered);
      const overlap = titleTokens.filter(t => sentSet.has(t)).length;
      titleBoost = 0.3 * (overlap / titleTokens.length);
    }

    return tfidf + posBoost + titleBoost;
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

    // Tokenize all sentences
    const sentenceTokens = sentences.map(s => this._tokenize(s));
    const titleTokens = this._tokenize(title || '')
      .filter(t => !this._STOP_WORDS.has(t) && t.length > 2);

    // Compute IDF across all sentences
    const idf = this._inverseDocFrequency(sentenceTokens);

    // Score each sentence
    const scored = sentences.map((sent, i) => {
      const tf = this._termFrequency(sentenceTokens[i]);
      const score = this._scoreSentence(
        sentenceTokens[i], tf, idf, i, sentences.length, titleTokens
      );
      return { sent, score, idx: i };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Pick top sentences, then re-order by original position for readability
    const shortPicks = scored.slice(0, 2).sort((a, b) => a.idx - b.idx);
    const longPicks = scored.slice(0, 4).sort((a, b) => a.idx - b.idx);

    return {
      short: shortPicks.map(s => s.sent).join(' '),
      long: longPicks.map(s => s.sent).join(' ')
    };
  }
};

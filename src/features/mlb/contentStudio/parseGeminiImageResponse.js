/**
 * parseGeminiImageResponse
 *
 * Safely extracts image data from a Gemini SDK response.
 * Handles the various response shapes the API can return.
 */

/**
 * @typedef {Object} ParsedImage
 * @property {string} base64      - base64-encoded image bytes
 * @property {string} mimeType    - e.g. 'image/png' or 'image/jpeg'
 */

/**
 * @typedef {Object} ParseResult
 * @property {boolean} ok
 * @property {ParsedImage} [image]
 * @property {string} [error]
 * @property {string} [textFallback] - any text returned instead of image
 */

/**
 * Parse a Gemini generateContent response for image data.
 *
 * @param {Object} response - raw SDK response from generateContent
 * @returns {ParseResult}
 */
export function parseGeminiImageResponse(response) {
  try {
    if (!response) {
      return { ok: false, error: 'Empty response from Gemini' };
    }

    // SDK v1 shape: response.candidates[0].content.parts[]
    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      return { ok: false, error: 'No candidates in Gemini response' };
    }

    const parts = candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      return { ok: false, error: 'No parts in Gemini response candidate' };
    }

    // Look for inline image data
    for (const part of parts) {
      if (part.inlineData) {
        const { data, mimeType } = part.inlineData;
        if (data && mimeType) {
          return {
            ok: true,
            image: { base64: data, mimeType },
          };
        }
      }
    }

    // If no image found, check for text (model may have returned text instead)
    const textParts = parts.filter(p => p.text).map(p => p.text);
    if (textParts.length > 0) {
      return {
        ok: false,
        error: 'Gemini returned text instead of an image',
        textFallback: textParts.join('\n'),
      };
    }

    return { ok: false, error: 'No image data found in Gemini response parts' };
  } catch (err) {
    return { ok: false, error: `Failed to parse Gemini response: ${err.message}` };
  }
}

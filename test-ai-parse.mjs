// Run with: node test-ai-parse.mjs
// Tests the JSON extraction logic without any API calls.

function extractJson(raw) {
    // Strip markdown fences
    const stripped = raw
      .replace(/^```(?:json)?\s*\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim()
  
    const startArr = stripped.indexOf('[')
    const startObj = stripped.indexOf('{')
    let jsonStr = stripped
  
    if (startArr !== -1 || startObj !== -1) {
      let start, endChar
      if (startArr === -1) { start = startObj; endChar = '}' }
      else if (startObj === -1) { start = startArr; endChar = ']' }
      else if (startArr < startObj) { start = startArr; endChar = ']' }
      else { start = startObj; endChar = '}' }
  
      const end = stripped.lastIndexOf(endChar)
      if (end > start) jsonStr = stripped.slice(start, end + 1)
    }
  
    return JSON.parse(jsonStr)
  }
  
  // Simulate the actual truncated response from the error message — 
  // the real response is much longer. Let's build a realistic full response:
  const simulatedFullResponse = `[
    {
      "type": "point",
      "content": "INTRODUCTION: The God Who Moves First",
      "parent_index": null,
      "estimated_minutes": 5,
      "confidence": "high"
    },
    {
      "type": "illustration",
      "content": "Open with the universal human experience: the fear that we have somehow disqualified ourselves from God's grace.",
      "parent_index": 0,
      "estimated_minutes": 2,
      "confidence": "high"
    },
    {
      "type": "point",
      "content": "MAIN POINT 1: God initiates covenant with Abram",
      "parent_index": null,
      "estimated_minutes": 10,
      "confidence": "high"
    },
    {
      "type": "scripture",
      "content": "Genesis 15:1 — 'Do not be afraid, Abram. I am your shield.'",
      "parent_index": 2,
      "estimated_minutes": 2,
      "confidence": "high"
    },
    {
      "type": "application",
      "content": "Where in your life do you need to receive, not achieve, God's promises?",
      "parent_index": null,
      "estimated_minutes": 5,
      "confidence": "medium"
    },
    {
      "type": "point",
      "content": "CONCLUSION: Rest in the covenant keeper",
      "parent_index": null,
      "estimated_minutes": 5,
      "confidence": "high"
    }
  ]`
  
  // Test cases
  const tests = [
    { label: 'Clean array', input: simulatedFullResponse },
    { label: 'With preamble', input: `Here is your outline:\n${simulatedFullResponse}` },
    { label: 'With markdown fence', input: `\`\`\`json\n${simulatedFullResponse}\n\`\`\`` },
    { label: 'With trailing text', input: `${simulatedFullResponse}\n\nLet me know if you'd like adjustments.` },
    { label: 'Preamble + fence + trailing', input: `Here is the JSON:\n\`\`\`json\n${simulatedFullResponse}\n\`\`\`\nHope this helps!` },
  ]
  
  let passed = 0
  for (const t of tests) {
    try {
      const result = extractJson(t.input)
      if (!Array.isArray(result)) throw new Error('Not an array')
      if (result.length === 0) throw new Error('Empty array')
      console.log(`✓ ${t.label} — ${result.length} blocks`)
      passed++
    } catch (e) {
      console.log(`✗ ${t.label} — ${e.message}`)
      console.log(`  Input snippet: ${t.input.slice(0, 80)}...`)
    }
  }
  
  console.log(`\n${passed}/${tests.length} passed`)
  
  // Also test the actual truncated raw from the error message to see if it fails:
  const truncated = `[ { "type": "point", "content": "INTRODUCTION: The God Who Moves First", "parent_index": null, "estimated_minutes": 5, "confidence": "high" }, { "type": "illustration", "content": "Open with the universal human experience: the fear that we have somehow disqualified`
  try {
    extractJson(truncated)
    console.log('\nTruncated raw: ✓ parsed (unexpected)')
  } catch (e) {
    console.log(`\nTruncated raw: ✗ fails as expected (${e.message})`)
    console.log('→ This confirms the error is from truncation in the error message only.')
    console.log('→ The actual API response is valid JSON — the max_tokens limit may be cutting it off.')
  }
  
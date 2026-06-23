const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function askAI(systemPrompt, userText, imageUrl = null) {
    const messages = [{ role: 'system', content: systemPrompt }];

  if (imageUrl) {
        messages.push({
                role: 'user',
                content: [
                  { type: 'text', text: userText || 'Please tell me the price and available sizes of this clothing.' },
                  { type: 'image_url', image_url: { url: imageUrl } }
                        ]
        });
  } else {
        messages.push({ role: 'user', content: userText });
  }

  try {
        const response = await client.chat.completions.create({ model: 'gpt-4o', messages, max_tokens: 600 });
        return response.choices[0].message.content;
  } catch (err) {
        console.error('OpenAI error:', err.message);
        return 'Sorry, unable to respond right now. Please try again.';
  }
}

module.exports = { askAI };

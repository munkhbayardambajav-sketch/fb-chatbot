const fetch = require('node-fetch');
const FB_API = 'https://graph.facebook.com/v19.0';

async function sendMessage(token, recipientId, text) {
    const chunks = splitText(text, 2000);
    for (const chunk of chunks) {
          await fetch(`${FB_API}/me/messages?access_token=${token}`, {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ recipient: { id: recipientId }, message: { text: chunk } })
          });
    }
}

async function sendImageMessage(token, recipientId, imageUrl) {
    await fetch(`${FB_API}/me/messages?access_token=${token}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
                  recipient: { id: recipientId },
                  message: {
                            attachment: {
                                        type: 'image',
                                        payload: { url: imageUrl, is_reusable: true }
                            }
                  }
          })
    });
}

async function replyToComment(token, commentId, text) {
    const res = await fetch(`${FB_API}/${commentId}/comments`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ message: text, access_token: token })
    });
    if (!res.ok) console.error('Comment error:', await res.text());
}

function splitText(text, maxLen) {
    if (text.length <= maxLen) return [text];
    const parts = [];
    while (text.length > 0) { parts.push(text.slice(0, maxLen)); text = text.slice(maxLen); }
    return parts;
}

module.exports = { sendMessage, sendImageMessage, replyToComment };

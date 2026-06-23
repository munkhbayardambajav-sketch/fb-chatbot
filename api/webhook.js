const { askAI } = require('../utils/openai');
const { sendMessage, replyToComment } = require('../utils/messenger');
const { getAvailableSlots, bookSlot } = require('../utils/sheets');
const pages = require('../config/pages');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'POST') {
    const body = req.body;
    if (!body || !body.entry) {
      return res.status(200).send('EVENT_RECEIVED');
    }

    const tasks = [];

    for (const entry of body.entry) {
      const pageConfig = pages[entry.id];
      if (!pageConfig) continue;

      if (entry.messaging) {
        for (const event of entry.messaging) {
          if (!event.message || event.message.is_echo) continue;
          const senderId = event.sender.id;
          const userText = event.message.text || '';
          const attachments = event.message.attachments || [];
          let imageUrl = null;
          if (attachments.length > 0 && attachments[0].type === 'image') {
            imageUrl = attachments[0].payload.url;
          }

          tasks.push((async () => {
            try {
              // Build dynamic system prompt with available slots if sheet is configured
              let systemPrompt = pageConfig.systemPrompt;
              if (pageConfig.spreadsheetId) {
                const slots = await getAvailableSlots(pageConfig.spreadsheetId);
                if (slots) {
                  systemPrompt += '\n\nОДООГИЙН СУЛ ЦАГУУД (Google Sheet-ээс):\n' + slots;
                }
              }

              const reply = await askAI(systemPrompt, userText, imageUrl);

              // Check if AI confirmed a booking: [BOOK:date:time:name:phone]
              const bookMatch = reply.match(/\[BOOK:([^:]+):([^:]+):([^:]+):([^\]]+)\]/);
              if (bookMatch && pageConfig.spreadsheetId) {
                const [, date, time, name, phone] = bookMatch;
                await bookSlot(pageConfig.spreadsheetId, date, time, name, phone);
              }

              // Send reply without the [BOOK:...] marker
              const cleanReply = reply.replace(/\[BOOK:[^\]]+\]/g, '').trim();
              await sendMessage(pageConfig.token, senderId, cleanReply);
            } catch (err) {
              console.error('Messenger error:', err);
            }
          })());
        }
      }

      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field !== 'feed') continue;
          const val = change.value;
          if (val.item !== 'comment' || val.verb !== 'add') continue;
          if (!val.comment_id || !val.message) continue;
          tasks.push(
            askAI(pageConfig.systemPrompt, val.message, null)
              .then(reply => replyToComment(pageConfig.token, val.comment_id, reply))
              .catch(err => console.error('Comment error:', err))
          );
        }
      }
    }

    await Promise.all(tasks);
    return res.status(200).send('EVENT_RECEIVED');
  }
};

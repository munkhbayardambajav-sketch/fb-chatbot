const { askAI } = require('../utils/openai');
const { sendMessage, replyToComment } = require('../utils/messenger');
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
          res.status(200).send('EVENT_RECEIVED');
          const body = req.body;
          if (!body || !body.entry) return;

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
                                  try {
                                                const reply = await askAI(pageConfig.systemPrompt, userText, imageUrl);
                                                await sendMessage(pageConfig.token, senderId, reply);
                                  } catch (err) {
                                                console.error('Messenger error:', err);
                                  }
                      }
            }

            if (entry.changes) {
                      for (const change of entry.changes) {
                                  if (change.field !== 'feed') continue;
                                  const val = change.value;
                                  if (val.item !== 'comment' || val.verb !== 'add') continue;
                                  if (!val.comment_id || !val.message) continue;
                                  try {
                                                const reply = await askAI(pageConfig.systemPrompt, val.message, null);
                                                await replyToComment(pageConfig.token, val.comment_id, reply);
                                  } catch (err) {
                                                console.error('Comment error:', err);
                                  }
                      }
            }
      }
    }
};

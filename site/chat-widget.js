/**
 * PhD Demographics Chat Widget
 *
 * Drop-in chat assistant for any page. Loads a floating chat bubble
 * in the bottom-right corner. Communicates with the Lambda backend.
 *
 * Usage: <script src="/chat-widget.js"></script>
 *
 * Configuration is handled server-side. No API keys or endpoints
 * are exposed in this file — the endpoint URL is injected at deploy time.
 */
(function() {
  // Chat endpoint — set during deployment
  const CHAT_ENDPOINT = 'https://7e4ll4vmqi2f5vuamynrhb3n5u0atduv.lambda-url.us-east-1.on.aws/';

  // Don't load if placeholder
  if (CHAT_ENDPOINT.includes('PLACEHOLDER')) return;

  let isOpen = false;
  let history = [];
  let isLoading = false;

  const css = `
    #chat-bubble { position: fixed; bottom: 20px; right: 20px; z-index: 1000; width: 52px; height: 52px; border-radius: 50%; background: #38bdf8; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; transition: transform 0.2s; }
    #chat-bubble:hover { transform: scale(1.1); }
    #chat-panel { position: fixed; bottom: 80px; right: 20px; z-index: 1000; width: 380px; max-height: 500px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.4); display: none; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #chat-panel.open { display: flex; }
    .chat-header { padding: 12px 16px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
    .chat-header span { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
    .chat-header button { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.1rem; padding: 0 4px; }
    .chat-messages { flex: 1; overflow-y: auto; padding: 12px; max-height: 340px; }
    .chat-msg { margin-bottom: 10px; font-size: 0.82rem; line-height: 1.5; }
    .chat-msg.user { text-align: right; }
    .chat-msg.user .chat-content { background: #334155; color: #e2e8f0; display: inline-block; padding: 8px 12px; border-radius: 12px 12px 2px 12px; max-width: 85%; text-align: left; }
    .chat-msg.assistant .chat-content { background: #0f172a; color: #e2e8f0; display: inline-block; padding: 8px 12px; border-radius: 12px 12px 12px 2px; max-width: 85%; }
    .chat-msg.assistant .chat-content a { color: #38bdf8; }
    .chat-msg.assistant .chat-content strong { color: #38bdf8; }
    .chat-msg.error .chat-content { background: rgba(248,113,113,0.1); color: #f87171; }
    .chat-input-row { display: flex; padding: 8px 12px; border-top: 1px solid #334155; gap: 8px; }
    .chat-input-row input { flex: 1; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; padding: 8px 12px; border-radius: 8px; font-size: 0.82rem; outline: none; }
    .chat-input-row input:focus { border-color: #38bdf8; }
    .chat-input-row input::placeholder { color: #64748b; }
    .chat-input-row button { background: #38bdf8; color: #0f172a; border: none; padding: 8px 14px; border-radius: 8px; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
    .chat-input-row button:disabled { opacity: 0.5; cursor: not-allowed; }
    .chat-typing { color: #64748b; font-size: 0.78rem; padding: 4px 0; }
    @media (max-width: 500px) { #chat-panel { right: 8px; left: 8px; width: auto; bottom: 72px; } }
  `;

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Chat bubble
  const bubble = document.createElement('button');
  bubble.id = 'chat-bubble';
  bubble.innerHTML = '💬';
  bubble.title = 'Ask about the data';
  bubble.onclick = () => { isOpen = !isOpen; panel.classList.toggle('open', isOpen); if (isOpen) input.focus(); };
  document.body.appendChild(bubble);

  // Chat panel
  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.innerHTML = `
    <div class="chat-header">
      <span>PhD Demographics Assistant</span>
      <button onclick="document.getElementById('chat-panel').classList.remove('open')">&times;</button>
    </div>
    <div class="chat-messages" id="chat-messages">
      <div class="chat-msg assistant"><div class="chat-content">Hi! I can help you explore international student data, visa trends, and university demographics. What would you like to know?</div></div>
    </div>
    <div class="chat-input-row">
      <input type="text" id="chat-input" placeholder="Ask about the data..." maxlength="2000">
      <button id="chat-send" onclick="window._chatSend()">Send</button>
    </div>
  `;
  document.body.appendChild(panel);

  const messagesEl = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._chatSend(); }
  });

  function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    div.innerHTML = `<div class="chat-content">${content}</div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function markdownToHtml(text) {
    // Simple markdown: bold, links, line breaks
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>')
      .replace(/`(.*?)`/g, '<code style="background:#334155;padding:1px 4px;border-radius:3px;">$1</code>')
      .replace(/\n/g, '<br>');
  }

  window._chatSend = async function() {
    const msg = input.value.trim();
    if (!msg || isLoading) return;

    addMessage('user', msg.replace(/</g, '&lt;'));
    input.value = '';
    isLoading = true;
    sendBtn.disabled = true;

    // Show typing indicator
    const typing = document.createElement('div');
    typing.className = 'chat-msg assistant';
    typing.innerHTML = '<div class="chat-content chat-typing">Thinking...</div>';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const resp = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          conversationHistory: history,
        }),
      });

      typing.remove();

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Service unavailable' }));
        addMessage('error', err.error || 'Something went wrong.');
      } else {
        const data = await resp.json();
        const reply = data.reply || 'No response.';
        let replyHtml = markdownToHtml(reply);

        // Handle navigation actions from tool calls
        if (data.navigation && data.navigation.length > 0) {
          for (const nav of data.navigation) {
            const page = nav.page || '';
            const sectionId = nav.section_id || '';
            const desc = nav.description || 'View data';
            const currentPage = location.pathname.split('/').pop() || '';
            const href = sectionId ? `${page}#${sectionId}` : page;
            const isSamePage = (currentPage === page || (!page && sectionId));

            replyHtml += `<div style="margin-top:8px;padding:8px 10px;background:#0f172a;border:1px solid #334155;border-radius:6px;font-size:0.78rem;">`;
            if (isSamePage && sectionId) {
              replyHtml += `<a href="javascript:void(0)" onclick="document.getElementById('${sectionId}')?.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('chat-panel').classList.remove('open');" style="color:#38bdf8;text-decoration:none;font-weight:600;">→ ${desc}</a>`;
            } else {
              replyHtml += `<a href="/${href}" style="color:#38bdf8;text-decoration:none;font-weight:600;">→ ${desc}</a>`;
            }
            replyHtml += `</div>`;
          }
        }

        addMessage('assistant', replyHtml);
        history.push({ role: 'user', content: msg });
        history.push({ role: 'assistant', content: reply });
        if (history.length > 40) history = history.slice(-20);
      }
    } catch (e) {
      typing.remove();
      addMessage('error', 'Network error. Please try again.');
    }

    isLoading = false;
    sendBtn.disabled = false;
  };
})();
